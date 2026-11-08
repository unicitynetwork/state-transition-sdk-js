import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { ShardId } from '../../../src/api/bft/ShardId.js';
import { TrustBaseHistory } from '../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import {
  OperationUnicityCertificateVerifier,
  UnicityCertificateVerifier,
} from '../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { CertificationData } from '../../../src/api/CertificationData.js';
import { InclusionProofResponse } from '../../../src/api/InclusionProofResponse.js';
import {
  fetchMembershipEvidence,
  INonInclusionAggregatorClient,
  isNonInclusionAggregatorClient,
} from '../../../src/api/INonInclusionAggregatorClient.js';
import { JsonRpcDataError } from '../../../src/api/json-rpc/JsonRpcDataError.js';
import { JsonRpcNetworkError } from '../../../src/api/json-rpc/JsonRpcNetworkError.js';
import { NonInclusionProof } from '../../../src/api/NonInclusionProof.js';
import { NonInclusionProofError } from '../../../src/api/NonInclusionProofError.js';
import { NonInclusionSnapshot, verifyNonInclusion } from '../../../src/api/NonInclusionVerification.js';
import { ProofStatusHint } from '../../../src/api/ProofStatusHint.js';
import { SdkError } from '../../../src/api/SdkError.js';
import { StateId } from '../../../src/api/StateId.js';
import { Secp256k1SignatureVerifier } from '../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { IVerificationContext } from '../../../src/transaction/verification/IVerificationContext.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { ShardedWorld } from '../../utils/ShardedWorld.js';
import { loadAuthorityHistory } from '../../utils/TrustBaseHistoryFixture.js';

const ROOT = join(process.cwd(), 'tests/fixtures/non-inclusion/v2');
const golden = JSON.parse(readFileSync(join(ROOT, 'cases/golden-two-leaf.json'), 'utf8')) as {
  query: string;
  wrapper: string;
};
const stateId = StateId.fromCBOR(CborSerializer.encodeByteString(HexConverter.decode(golden.query)));
let trustBase: TrustBaseHistory;
beforeAll(async () => {
  trustBase = await loadAuthorityHistory(join(ROOT, 'authority/trust-base.json'));
});
const verifier = new UnicityCertificateVerifier(
  new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
);

/** The context as a class: its members are #private getters, reading them with a wrong receiver throws. */
class PrivateGetterContext {
  readonly #trustBase: TrustBaseHistory;
  readonly #verifier: UnicityCertificateVerifier;

  public constructor() {
    this.#trustBase = trustBase;
    this.#verifier = verifier;
  }

  public get trustBase(): TrustBaseHistory {
    return this.#trustBase;
  }

  public get unicityCertificateVerifier(): UnicityCertificateVerifier {
    return this.#verifier;
  }
}

function respondWith(body: (id: string) => unknown, status = 200): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
    const id = (JSON.parse(init?.body as string) as { id: string }).id;
    return Promise.resolve(new Response(JSON.stringify(body(id)), { status }));
  });
}

describe('AggregatorClient.getNonInclusionProof', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  it('is an optional capability next to the unchanged required interface', () => {
    expect(isNonInclusionAggregatorClient(client)).toBe(true);
    expect(
      isNonInclusionAggregatorClient({ getInclusionProof: jest.fn(), submitCertificationRequest: jest.fn() }),
    ).toBe(false);
  });

  it('sends the dedicated method with the state id, decodes the proof bound to that state and verifies it', async () => {
    const fetchMock = respondWith((id) => ({ id, jsonrpc: '2.0', result: golden.wrapper }));
    const answer = await client.getNonInclusionProof(stateId);
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toMatchObject({
      method: 'get_non_inclusion_proof.v1',
      params: { stateId: golden.query },
    });
    expect(answer.kind).toEqual('absence_proof');
    if (answer.kind !== 'absence_proof') {
      return;
    }
    expect(answer.proof.stateId).toBe(stateId);
    const result = await verifyNonInclusion(answer.proof, new PrivateGetterContext());
    expect(result.verdict).toEqual('absent_at_snapshot');
    expect(result.stateId).toBe(stateId);
    const snapshot = result.snapshot as NonInclusionSnapshot;
    expect(snapshot).toBeInstanceOf(NonInclusionSnapshot);
    expect(snapshot.rootRound).toBeGreaterThan(0n);
    expect(snapshot.partitionId).toEqual(7n);
    expect(snapshot.stateRoot).toHaveLength(32);
  });

  describe('server outcomes are the same over every HTTP status', () => {
    const envelope =
      (code: number, data?: unknown) =>
      (id: string): unknown => ({ error: { code, data, message: 'm' }, id, jsonrpc: '2.0' });

    it.each([200, 404, 409, 429, 500])('-32020 unavailable (HTTP %i)', async (status) => {
      respondWith(envelope(-32020), status);
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({
        kind: 'unavailable',
        retryable: true,
      });
    });

    it.each([200, 404, 409, 429])('-32022 is a claim, returned as a value (HTTP %i)', async (status) => {
      respondWith(envelope(-32022), status);
      await expect(client.getNonInclusionProof(stateId)).resolves.toEqual({ kind: 'state_included_hint' });
    });

    it.each([200, 429])('-32023 busy (HTTP %i)', async (status) => {
      respondWith(envelope(-32023), status);
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'busy', retryable: true });
    });

    it('keeps unknown codes and maps the standard ones', async () => {
      respondWith(envelope(-32099));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ code: -32099, kind: 'server' });
      respondWith(envelope(-32602));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ code: -32602, kind: 'rejected' });
    });

    it('treats anything that is not a complete matching envelope as transport or invalid, never as a claim', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response('<html>not found</html>', { status: 404 }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'transport', retryable: true });
      respondWith(() => ({ error: { code: -32022, message: 'm' }, id: 'someone-else', jsonrpc: '2.0' }), 409);
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'transport' });
      respondWith((id) => ({ error: { code: -32022, message: 'm' }, id, jsonrpc: '1.0' }), 409);
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'transport' });
      respondWith(() => ({ error: { code: -32022, message: 'm' }, id: 'someone-else', jsonrpc: '2.0' }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'invalid_response' });
      respondWith((id) => ({ error: { code: -32022, message: 'm' }, id, jsonrpc: '2.0', result: golden.wrapper }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'invalid_response' });
      respondWith((id) => ({ id, jsonrpc: '2.0', result: { proof: golden.wrapper } }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'invalid_response' });
    });

    it('rejects a result that is not a bounded, well formed proof', async () => {
      respondWith((id) => ({ id, jsonrpc: '2.0', result: 'zz' }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'invalid_response' });
      respondWith((id) => ({ id, jsonrpc: '2.0', result: 'ab'.repeat(NonInclusionProof.MAX_WIRE_BYTES + 1) }));
      await expect(client.getNonInclusionProof(stateId)).rejects.toMatchObject({ kind: 'invalid_response' });
    });
  });

  describe('one call, and the signal is honoured even by a transport that ignores it', () => {
    const hanging = (): jest.SpyInstance =>
      jest.spyOn(global, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));

    it('rejects on cancel with the caller reason as the cause', async () => {
      hanging();
      const controller = new AbortController();
      const reason = new Error('navigated away');
      setTimeout(() => controller.abort(reason), 20);
      const error = (await client
        .getNonInclusionProof(stateId, { signal: controller.signal })
        .catch((e: unknown) => e)) as NonInclusionProofError;
      expect(error).toMatchObject({ kind: 'cancelled', retryable: false });
      expect(error.cause).toBe(reason);
    });

    it('reports AbortSignal.timeout as a timeout with its reason', async () => {
      hanging();
      const signal = AbortSignal.timeout(50);
      const error = (await client
        .getNonInclusionProof(stateId, { signal })
        .catch((e: unknown) => e)) as NonInclusionProofError;
      expect(error.kind).toEqual('timeout');
      expect(error.cause).toBe(signal.reason);
    });

    it('makes exactly one request, no polling', async () => {
      const fetchMock = respondWith((id) => ({ error: { code: -32020, message: 'm' }, id, jsonrpc: '2.0' }));
      await client.getNonInclusionProof(stateId).catch(() => undefined);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('membership evidence', () => {
    it('is two independent calls and returns unverified evidence of the kind the service chose', async () => {
      const inclusion = jest.fn(() => Promise.resolve(InclusionProofResponse.fromCBOR(new Uint8Array())));
      const absent = await fetchMembershipEvidence(
        {
          getInclusionProof: inclusion,
          getNonInclusionProof: () =>
            Promise.resolve({
              kind: 'absence_proof',
              proof: NonInclusionProof.decode(stateId, HexConverter.decode(golden.wrapper)),
            }),
          submitCertificationRequest: jest.fn(),
        },
        stateId,
      );
      expect(absent.kind).toEqual('absence');
      expect(inclusion).not.toHaveBeenCalled();
    });

    const claiming = (
      inclusion: INonInclusionAggregatorClient['getInclusionProof'],
    ): INonInclusionAggregatorClient => ({
      getInclusionProof: inclusion,
      getNonInclusionProof: () => Promise.resolve({ kind: 'state_included_hint' }),
      submitCertificationRequest: jest.fn(),
    });

    it('treats a claimed inclusion without a proof yet as a retryable race, not a bad response', async () => {
      const client = claiming(() => Promise.resolve({ inclusionProof: null } as unknown as InclusionProofResponse));
      await expect(fetchMembershipEvidence(client, stateId)).rejects.toMatchObject({
        kind: 'unavailable',
        retryable: true,
      });
    });

    describe('second call through the real client (classified by phase, never by message)', () => {
      afterEach(() => jest.restoreAllMocks());

      /** First call claims inclusion (-32022), the second answers `second`. */
      function claimThenAnswer(second: (id: string) => unknown, status = 200): void {
        jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
          const request = JSON.parse(init?.body as string) as { id: string; method: string };
          if (request.method === 'get_non_inclusion_proof.v1') {
            return Promise.resolve(
              new Response(
                JSON.stringify({ error: { code: -32022, message: 'included' }, id: request.id, jsonrpc: '2.0' }),
              ),
            );
          }
          return Promise.resolve(new Response(JSON.stringify(second(request.id)), { status }));
        });
      }
      const rpcError =
        (code: number, message: string) =>
        (id: string): unknown => ({
          error: { code, message },
          id,
          jsonrpc: '2.0',
        });
      const aggregator = new AggregatorClient('https://example.com');

      it.each([
        [-32602, 'invalid hex string: odd length', 200, 'rejected', false],
        [-32023, 'busy: hex decoder queue full', 200, 'busy', true],
        [-32020, 'no snapshot (hex)', 503, 'unavailable', true],
      ])(
        'keeps the RPC classification of error %i whatever its text says',
        async (code, message, status, kind, retry) => {
          claimThenAnswer(rpcError(code, message), status);
          await expect(fetchMembershipEvidence(aggregator, stateId)).rejects.toMatchObject({ kind, retryable: retry });
        },
      );

      it('classifies every undecodable result of the second call as invalid_response', async () => {
        const world = await ShardedWorld.create(0);
        const salt = TokenSalt.generate();
        const mint = await MintTransaction.create(
          world.network,
          SignaturePredicate.create(SigningService.generate().publicKey),
          {
            salt,
            tokenType: TokenType.generate(),
          },
        );
        await world.router.submitCertificationRequest(await CertificationData.fromMintTransaction(mint));
        const response = await world.client('').getInclusionProof(await StateId.fromTransaction(mint));
        const proof = response.toCBOR();
        const certificate = response.inclusionProof!.inclusionCertificate.encode();
        const hex = HexConverter.encode(proof);
        const flip = (bytes: Uint8Array, index: number): Uint8Array => {
          const copy = new Uint8Array(bytes);
          copy[index] ^= 0x01;
          return copy;
        };
        const replaced = (bytes: Uint8Array): string =>
          hex.replace(HexConverter.encode(certificate), HexConverter.encode(bytes));
        expect(replaced(certificate)).toEqual(hex);

        const malformed = [
          'zz', // not hex
          '0', // odd length
          '', // empty
          '00', // not CBOR of a proof
          hex.slice(0, hex.length - 8), // truncated
          // InclusionCertificate.decode throws a plain Error for each of these
          replaced(flip(certificate, 0)), // sibling count does not match the bitmap
          replaced(certificate.slice(0, 5)), // bitmap too short
          replaced(certificate.slice(0, certificate.length - 3)), // misaligned siblings
        ];
        for (const result of malformed) {
          for (const shape of [(r: string): unknown => r, (r: string): unknown => ({ proof: r })]) {
            claimThenAnswer((id) => ({ id, jsonrpc: '2.0', result: shape(result) }));
            await expect(fetchMembershipEvidence(aggregator, stateId)).rejects.toMatchObject({
              kind: 'invalid_response',
              retryable: false,
            });
            jest.restoreAllMocks();
          }
        }
      });
    });

    it('types every failure of the second call like the first, and bounds it by the signal', async () => {
      await expect(
        fetchMembershipEvidence(
          claiming(() => Promise.reject(new JsonRpcNetworkError(502, 'bad gateway'))),
          stateId,
        ),
      ).rejects.toMatchObject({ kind: 'transport', retryable: true });
      await expect(
        fetchMembershipEvidence(
          claiming(() => Promise.reject(new JsonRpcDataError({ code: -32023, message: 'busy' }))),
          stateId,
        ),
      ).rejects.toMatchObject({ kind: 'busy' });

      // a second call that ignores the signal and never answers
      const controller = new AbortController();
      const reason = new Error('stop');
      setTimeout(() => controller.abort(reason), 20);
      const error = (await fetchMembershipEvidence(
        claiming(() => new Promise(() => undefined)),
        stateId,
        {
          signal: controller.signal,
        },
      ).catch((e: unknown) => e)) as NonInclusionProofError;
      expect(error).toMatchObject({ kind: 'cancelled' });
      expect(error.cause).toBe(reason);
    });
  });
});

describe('non-inclusion API shape', () => {
  const proof = NonInclusionProof.decode(stateId, HexConverter.decode(golden.wrapper));

  it('keeps decoded material, the snapshot and the status hint apart at the type level', async () => {
    const verified = await verifyNonInclusion(proof, new PrivateGetterContext());
    const hint: ProofStatusHint = 'unknown';
    // @ts-expect-error decoded wire material is not a snapshot
    const asSnapshot: NonInclusionSnapshot = proof;
    // @ts-expect-error a status hint is not a snapshot
    const hintAsSnapshot: NonInclusionSnapshot = hint;
    // @ts-expect-error a snapshot is not decoded material
    const snapshotAsProof: NonInclusionProof = verified.snapshot;
    // @ts-expect-error a status hint is not decoded material
    const hintAsProof: NonInclusionProof = hint;
    // @ts-expect-error a snapshot only exists after narrowing on the verdict (a rejection has none)
    const bare: NonInclusionSnapshot = verified.snapshot;
    expect([asSnapshot, hintAsSnapshot, snapshotAsProof, hintAsProof, bare]).toHaveLength(5);
    expect(verified.verdict).toEqual('absent_at_snapshot');
  });

  it('cannot be forged: the snapshot has no public constructor path', () => {
    expect(
      () =>
        new NonInclusionSnapshot(Symbol('x'), {
          networkId: 1,
          partitionId: 7n,
          rootEpoch: 1n,
          rootRound: 1n,
          sealTimestampSeconds: 1n,
          shardEpoch: 1n,
          shardId: ShardId.ROOT,
          shardRound: 1n,
          stateRoot: null,
        }),
    ).toThrow(TypeError);
    expect(Object.isFrozen(proof.certificate)).toBe(false); // decoded data is a copy, never shared state
  });

  it('owns its bytes', () => {
    const bytes = HexConverter.decode(golden.wrapper);
    const decoded = NonInclusionProof.decode(stateId, bytes);
    bytes.fill(0);
    expect(decoded.toCBOR()).toEqual(HexConverter.decode(golden.wrapper));
    const copy = decoded.certificate.toBytes();
    copy.fill(7);
    expect(decoded.certificate.toBytes()).not.toEqual(copy);
  });

  it('rejects a context that is not what the verification session was anchored to', async () => {
    const other = await loadAuthorityHistory(join(ROOT, 'authority/other-network.json'));
    const { SealVerificationSession } = await import('../../../src/api/bft/verification/SealVerificationSession.js');
    const session = new SealVerificationSession(other, verifier.quorumRule);
    await expect(verifyNonInclusion(proof, new PrivateGetterContext(), { session })).rejects.toThrow(TypeError);
  });

  it('errors are SdkErrors with a literal name that survive another copy of the SDK', () => {
    const e = new NonInclusionProofError('busy', 'x', { retryable: true });
    expect(e.name).toEqual('NonInclusionProofError');
    expect(SdkError.is(e)).toBe(true);
    expect(NonInclusionProofError.is(e)).toBe(true);
    expect(NonInclusionProofError.is(new Error('x'))).toBe(false);
    const context: IVerificationContext['trustBase'] = trustBase;
    expect(context).toBeDefined();
  });

  it('shares the seal session of an operation scoped verifier: a seal is checked once, no extra knob', async () => {
    const operation = verifier.beginOperation();
    const context = { trustBase, unicityCertificateVerifier: operation };
    const first = await verifyNonInclusion(proof, context);
    const second = await verifyNonInclusion(proof, context);
    expect([first.verdict, second.verdict]).toEqual(['absent_at_snapshot', 'absent_at_snapshot']);
    expect((operation as OperationUnicityCertificateVerifier).stats.quorumChecks).toEqual(1);
  });
});
