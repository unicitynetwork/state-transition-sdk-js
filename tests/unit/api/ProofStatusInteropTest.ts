import { writeFileSync } from 'node:fs';

import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { BatchProofError } from '../../../src/api/BatchProofError.js';
import { CertificationStatus } from '../../../src/api/CertificationResponse.js';
import { InclusionProofExpiredError, InclusionProofUnknownError } from '../../../src/api/InclusionProofStatusError.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { StateId } from '../../../src/api/StateId.js';
import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../src/predicate/builtin/SignaturePredicate.js';
import { PredicateVerifierService } from '../../../src/predicate/verification/PredicateVerifierService.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { MintTransaction } from '../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../src/transaction/TokenType.js';
import { SleepError, waitInclusionProof } from '../../../src/util/InclusionProofUtils.js';
import { scenario } from '../../utils/ConsolidationScenario.js';
import { ShardedWorld } from '../../utils/ShardedWorld.js';
import { createUnicityCertificateVerifier } from '../../utils/UnicityCertificateVerifierFixture.js';

/**
 * Interop with a real aggregator-go gateway (proof status contract, aggregator-go#209/#210). Opt-in: set
 * PROOF_STATUS_SERVER to the base URL of a server that answers by the first byte of the state id
 * (1 pending, 2 expired, 3 unknown, 4 included; batch: 1/2/3 single class, 5 mixed, 6 exact root absent), see
 * the PR description for the fixture server. PROOF_STATUS_WRITE_UC=<file> only writes a valid certificate for it.
 */
const SERVER = process.env.PROOF_STATUS_SERVER;
const WRITE_UC = process.env.PROOF_STATUS_WRITE_UC;

jest.setTimeout(120_000);

const id = (first: number, second = 0): StateId =>
  StateId.fromCBOR(
    CborSerializer.encodeByteString(new Uint8Array(32).fill(0).map((_, i) => (i === 0 ? first : i === 1 ? second : 9))),
  );

(WRITE_UC ? describe : describe.skip)('write the certificate for the interop server', () => {
  it('writes it', async () => {
    const world = await ShardedWorld.create(0);
    const uc = world.latest.ucs.get('');
    writeFileSync(WRITE_UC as string, Buffer.from(uc?.toCBOR() as Uint8Array).toString('hex'));
  });
});

(SERVER ? describe : describe.skip)('against a real aggregator-go with proof status (#209/#210)', () => {
  const client = new AggregatorClient(SERVER as string, null, true);

  it('v2: no status without the opt-in (string result), the hint with it', async () => {
    for (const first of [1, 2, 3]) {
      expect((await client.getInclusionProof(id(first))).statusHint).toBeNull();
    }
    expect((await client.getInclusionProof(id(1), { includeStatusHint: true })).statusHint).toEqual('pending');
    expect((await client.getInclusionProof(id(2), { includeStatusHint: true })).statusHint).toEqual('expired');
    expect((await client.getInclusionProof(id(3), { includeStatusHint: true })).statusHint).toEqual('unknown');
    // the proof is the same bytes with and without the hint
    const plain = await client.getInclusionProof(id(2));
    const hinted = await client.getInclusionProof(id(2), { includeStatusHint: true });
    expect(hinted.toCBOR()).toEqual(plain.toCBOR());
  });

  it('v2: a state with a proof is included even if a stale pending mark exists', async () => {
    const response = await client.getInclusionProof(id(4), { includeStatusHint: true });
    expect(response.statusHint).toEqual('included');
    expect(response.inclusionProof).not.toBeNull();
  });

  it('batch: details, retryability and the offending indexes per class', async () => {
    const fail = (ids: StateId[], root?: DataHash): Promise<BatchProofError> =>
      client.getInclusionProofs(ids, { stateRoot: root }).then(
        () => {
          throw new Error('expected a failure');
        },
        (e: unknown) => e as BatchProofError,
      );
    const pending = await fail([id(1), id(0, 1)]);
    expect([pending.kind, pending.detail, pending.retryable, pending.indexes]).toEqual([
      'unavailable',
      'state_pending',
      true,
      [0],
    ]);
    const expired = await fail([id(2)]);
    expect([expired.detail, expired.retryable, expired.indexes]).toEqual(['state_expired', false, [0]]);
    const unknown = await fail([id(3)]);
    expect([unknown.detail, unknown.retryable, unknown.indexes]).toEqual(['state_unknown', false, [0]]);
    const mixed = await fail([id(5), id(5, 1), id(5, 2)]);
    expect(mixed.detail).toEqual('state_unknown');
    expect(mixed.indexesByClass).toEqual({ expired: [1], pending: [0], unknown: [2] });
    const notInRoot = await fail([id(6)], new DataHash(HashAlgorithm.SHA256, new Uint8Array(32).fill(1)));
    expect([notInRoot.detail, notInRoot.retryable, notInRoot.indexes]).toEqual(['state_not_in_root', false, [0]]);
  });

  it('resubmitting a request whose state id the queue already holds is a queued state id, not a failure', async () => {
    const s = await scenario(0);
    const token = await s.history(0);
    const response = await client.submitCertificationRequest(token.genesis.inclusionProof.certificationData);
    // a queued state id, not necessarily this request: not accepted, the caller waits for the proof and compares
    expect(response.status).toEqual(CertificationStatus.STATE_ID_QUEUED);
    expect(response.isAccepted).toBe(false);
  });

  describe('waitInclusionProof', () => {
    const owner = SigningService.generate();
    const wait = async (first: number, signal: AbortSignal, grace?: number): Promise<unknown> => {
      let transaction: MintTransaction | undefined;
      for (let i = 0; i < 20_000 && !transaction; i++) {
        const candidate = await MintTransaction.create(NetworkId.LOCAL, SignaturePredicate.create(owner.publicKey), {
          salt: TokenSalt.generate(),
          tokenType: TokenType.generate(),
        });
        if ((await StateId.fromTransaction(candidate)).data[0] === first) {
          transaction = candidate;
        }
      }
      const world = await ShardedWorld.create(0);
      return waitInclusionProof(
        new StateTransitionClient(client),
        world.trustBase,
        PredicateVerifierService.create(),
        createUnicityCertificateVerifier(),
        transaction as MintTransaction,
        { intervalMs: 50, signal, unknownGraceMs: grace },
      );
    };

    it('fails fast on expired and on unknown, keeps waiting while pending', async () => {
      await expect(wait(2, AbortSignal.timeout(30_000))).rejects.toBeInstanceOf(InclusionProofExpiredError);
      await expect(wait(3, AbortSignal.timeout(30_000), 0)).rejects.toBeInstanceOf(InclusionProofUnknownError);
      await expect(wait(1, AbortSignal.timeout(400))).rejects.toBeInstanceOf(SleepError);
    });
  });
});
