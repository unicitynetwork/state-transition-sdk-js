import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { JsonRpcNetworkError } from '../../../src/api/json-rpc/JsonRpcNetworkError.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { StateId } from '../../../src/api/StateId.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { SleepError, waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import { expiresAt } from '../../utils/ExpiresAt.js';
import { createRootTrustBase } from '../../utils/RootTrustBaseFixture.js';
import { createUnicityCertificateVerifier } from '../../utils/UnicityCertificateVerifierFixture.js';

/** What rugregator answers for a state it has not indexed: HTTP 404 with a JSON-RPC error envelope. */
function notFound404(): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
    const id = (JSON.parse(init?.body as string) as { id: string }).id;
    return Promise.resolve(
      new Response(JSON.stringify({ error: { code: -32020, message: 'not found' }, id, jsonrpc: '2.0' }), {
        status: 404,
      }),
    );
  });
}

describe('an error envelope on a non-2xx status', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is still a JsonRpcNetworkError with its status, the envelope is additive data', async () => {
    notFound404();
    const id = StateId.fromCBOR(CborSerializer.encodeByteString(new Uint8Array(32)));
    const error = (await new AggregatorClient('https://example.com')
      .getInclusionProof(id)
      .catch((e: unknown) => e)) as JsonRpcNetworkError;
    expect(error).toBeInstanceOf(JsonRpcNetworkError);
    expect(error.status).toEqual(404);
    expect(error.rpcError?.code).toEqual(-32020);
  });

  it('keeps waitInclusionProof polling against a server that answers 404 with an envelope', async () => {
    const fetchMock = notFound404();
    const signing = SigningService.generate();
    const transaction = await MintTransaction.create(NetworkId.LOCAL, SignaturePredicate.create(signing.publicKey), {
      expiresAt: expiresAt(),
      salt: TokenSalt.generate(),
      tokenType: TokenType.generate(),
    });
    await expect(
      waitInclusionProof(
        new StateTransitionClient(new AggregatorClient('https://example.com')),
        createRootTrustBase(signing.publicKey),
        PredicateVerifierService.create(),
        createUnicityCertificateVerifier(),
        transaction,
        AbortSignal.timeout(300),
        20,
      ),
    ).rejects.toThrow(SleepError);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });
});
