import { AGGREGATION_PARTITION_ID } from '../../../../src/api/bft/AggregationPartition.js';
import { InputRecord } from '../../../../src/api/bft/InputRecord.js';
import { UnicityCertificateStructureRule } from '../../../../src/api/bft/verification/rule/UnicityCertificateStructureRule.js';
import { UnicityCertificateVerifier } from '../../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { InclusionProof } from '../../../../src/api/InclusionProof.js';
import { DataHash } from '../../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { createTrustBaseHistorySync } from '../../../utils/TrustBaseHistoryFixture.js';
import { createUnicityCertificate, IUnicityCertificateOptions } from '../../../utils/UnicityCertificateFixture.js';
import { createUnicityCertificateVerifier } from '../../../utils/UnicityCertificateVerifierFixture.js';

const ROOT = new DataHash(HashAlgorithm.SHA256, new Uint8Array(32).fill(0x42));
const GENESIS_TIME = 1681971084n;

describe('fixed aggregation partition and native certificate structure', () => {
  const signingService = new SigningService(new Uint8Array(32).fill(0x07));
  const { history: trustBase, ready } = createTrustBaseHistorySync(signingService.publicKey);
  beforeAll(() => ready);

  async function proofOf(options: IUnicityCertificateOptions = {}): Promise<InclusionProof> {
    return {
      unicityCertificate: await createUnicityCertificate(ROOT, signingService, 1_755_000_000n, options),
    } as InclusionProof;
  }

  const verifiers: [string, () => UnicityCertificateVerifier][] = [
    ['plain verifier', (): UnicityCertificateVerifier => createUnicityCertificateVerifier()],
    ['operation verifier', (): UnicityCertificateVerifier => createUnicityCertificateVerifier().beginOperation()],
  ];

  it('is partition 7', () => {
    expect(AGGREGATION_PARTITION_ID).toBe(7n);
  });

  describe.each(verifiers)('%s', (_name, make) => {
    it('accepts a certificate of the aggregation partition with valid structure', async () => {
      const result = await make().verify(trustBase, await proofOf());
      expect(result.status).toEqual(VerificationStatus.OK);
    });

    it('rejects a validly signed certificate of another partition, also after the same verifier accepted partition 7', async () => {
      const verifier = make();
      expect((await verifier.verify(trustBase, await proofOf())).status).toEqual(VerificationStatus.OK);
      // a memo hit for the accepted certificate is served again; the other partition has its own, authentic, certificate
      expect((await verifier.verify(trustBase, await proofOf())).status).toEqual(VerificationStatus.OK);
      for (const partition of [0n, 1n, 6n, 8n, 0x0a0b0c0dn, 0xffffffffn]) {
        const result = await verifier.verify(trustBase, await proofOf({ partition }));
        expect(result.status).toEqual(VerificationStatus.FAIL);
        expect(result.results.map((r) => r.rule)).toContain('UnicityCertificateStructureRule');
      }
    });

    it.each<[string, IUnicityCertificateOptions]>([
      ['a nil block hash although the state hash changed', { blockHash: null }],
      ['an empty block hash although the state hash changed', { blockHash: new Uint8Array(0) }],
      ['a nil summary value from round 1', { summaryValue: null }],
      ['a technical record hash of 31 bytes', { technicalRecordHash: new Uint8Array(31) }],
      ['a nil technical record hash', { technicalRecordHash: null }],
      ['a seal round of 0', { sealRound: 0n }],
      ['a seal timestamp before the genesis time', { sealTimestamp: GENESIS_TIME - 1n }],
    ])('rejects, without throwing, %s', async (_label, options) => {
      const result = await make().verify(trustBase, await proofOf(options));
      expect(result.status).toEqual(VerificationStatus.FAIL);
      expect(result.results.at(-1)?.rule).toEqual('UnicityCertificateStructureRule');
    });

    it('accepts a seal timestamp exactly at the genesis time', async () => {
      const result = await make().verify(trustBase, await proofOf({ sealTimestamp: GENESIS_TIME }));
      expect(result.status).toEqual(VerificationStatus.OK);
    });
  });

  describe('InputRecord.structureFailure (Go InputRecord.IsValid)', () => {
    const hash = new Uint8Array(32).fill(1);
    const other = new Uint8Array(32).fill(2);
    const record = (
      round: bigint,
      previous: Uint8Array | null,
      current: Uint8Array | null,
      summary: Uint8Array | null,
      timestamp: bigint,
      block: Uint8Array | null,
    ): InputRecord => new InputRecord(round, 0n, previous, current, summary, timestamp, block, 0n, null);

    it('keeps the conditional rules: a null field alone is not malformed', () => {
      // round 0: a nil summary and an unassigned timestamp are legal
      expect(record(0n, null, hash, null, 0n, other).structureFailure()).toBeNull();
      // unchanged state hash: nil and empty block hash are the same
      expect(record(5n, hash, hash, new Uint8Array(0), 9n, null).structureFailure()).toBeNull();
      expect(record(5n, hash, hash, new Uint8Array(0), 9n, new Uint8Array(0)).structureFailure()).toBeNull();
      // both state hashes nil (initial state): unchanged
      expect(record(0n, null, null, null, 0n, null).structureFailure()).toBeNull();
    });

    it('rejects the malformed combinations', () => {
      expect(record(1n, null, hash, null, 9n, other).structureFailure()).toMatch(/summary/);
      expect(record(1n, null, hash, new Uint8Array(0), 0n, other).structureFailure()).toMatch(/timestamp/);
      expect(record(0n, hash, hash, null, 0n, other).structureFailure()).toMatch(/did not change/);
      expect(record(0n, hash, other, null, 0n, null).structureFailure()).toMatch(/block hash is nil/);
      expect(record(0n, hash, other, null, 0n, new Uint8Array(0)).structureFailure()).toMatch(/block hash is nil/);
    });
  });

  it('UnicityCertificateStructureRule never throws on a malformed certificate', () => {
    expect(UnicityCertificateStructureRule.failure({} as never)).not.toBeNull();
    expect(UnicityCertificateStructureRule.verify({} as never).status).toEqual(VerificationStatus.FAIL);
  });
});
