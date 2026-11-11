import { AGGREGATION_PARTITION_ID } from '../../../src/api/bft/AggregationPartition.js';
import { InputRecord } from '../../../src/api/bft/InputRecord.js';
import { ShardId } from '../../../src/api/bft/ShardId.js';
import { ShardTreeCertificate } from '../../../src/api/bft/ShardTreeCertificate.js';
import { TrustBaseHistory } from '../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { UnicityCertificate } from '../../../src/api/bft/UnicityCertificate.js';
import { UnicitySeal } from '../../../src/api/bft/UnicitySeal.js';
import { HashStep, UnicityTreeCertificate } from '../../../src/api/bft/UnicityTreeCertificate.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { SealVerificationSession } from '../../../src/api/bft/verification/SealVerificationSession.js';
import { UnicityCertificateVerifier } from '../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { NetworkId } from '../../../src/api/NetworkId.js';
import { NonInclusionProof } from '../../../src/api/NonInclusionProof.js';
import { verifyNonInclusion } from '../../../src/api/NonInclusionVerification.js';
import { StateId } from '../../../src/api/StateId.js';
import { DataHasher } from '../../../src/crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { Secp256k1SignatureVerifier } from '../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { SigningService } from '../../../src/crypto/secp256k1/SigningService.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { VerificationStatus } from '../../../src/verification/VerificationStatus.js';
import { createTrustBaseHistory, FIXTURE_EPOCH } from '../../utils/TrustBaseHistoryFixture.js';

// Architect ruling "Empty-tree ruling" §5: the authenticated empty tree is exactly IR hash = null. An empty byte string,
// a zero hash and every other representation are not aliases of it, also when a quorum signed that very certificate.

const PARTITION = AGGREGATION_PARTITION_ID;
const NODE = new SigningService(new Uint8Array(32).fill(7));
const QUERY = StateId.fromCBOR(CborSerializer.encodeByteString(new Uint8Array(32).fill(0xac)));
const TR_HASH = new Uint8Array(32).fill(0x33);
const CONF_HASH = new Uint8Array(32).fill(0x44);
const EMPTY = new Uint8Array(0);

let trustBase: TrustBaseHistory;
beforeAll(async () => {
  trustBase = await createTrustBaseHistory(NODE.publicKey);
});
const verifier = new UnicityCertificateVerifier(
  new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
);

function inputRecord(options: {
  /** Overrides the block hash derived from the state hash. */
  blockHash?: Uint8Array | null;
  hash: Uint8Array | null;
  round?: bigint;
  summary?: Uint8Array | null;
  timestamp?: bigint;
}): InputRecord {
  const round = options.round ?? 0n;
  return new InputRecord(
    round,
    0n,
    null,
    options.hash,
    options.summary === undefined ? null : options.summary,
    options.timestamp ?? 0n,
    // a changed state hash needs a block hash (bft-go-base InputRecord.IsValid), an unchanged one forbids it
    options.blockHash !== undefined
      ? options.blockHash
      : options.hash !== null && options.hash.length > 0
        ? new Uint8Array(32).fill(1)
        : null,
    0n,
    null,
  );
}

/** A unicity certificate for the unsharded partition whose seal is signed over exactly this input record. */
async function signedUc(
  ir: InputRecord,
  steps: HashStep[] = [],
  partition: bigint = PARTITION,
): Promise<UnicityCertificate> {
  const shardPath = new ShardTreeCertificate(ShardId.fromBits(''), []);
  const shardRoot = await UnicityCertificate.calculateShardTreeCertificateRootHash(ir, TR_HASH, CONF_HASH, shardPath);
  const treeHash = await new DataHasher(HashAlgorithm.SHA256)
    .update(CborSerializer.encodeByteString(shardRoot.data))
    .digest();
  const key = new Uint8Array([0, 0, 0, Number(partition)]);
  const sealHash = await new DataHasher(HashAlgorithm.SHA256)
    .update(CborSerializer.encodeByteString(new Uint8Array([0x01])))
    .update(CborSerializer.encodeByteString(key))
    .update(CborSerializer.encodeByteString(treeHash.data))
    .digest();
  const seal = await UnicitySeal.create(
    NetworkId.LOCAL,
    5n,
    FIXTURE_EPOCH,
    1700000000n,
    null,
    sealHash.data,
    new Map([['NODE', NODE]]),
  );
  return new UnicityCertificate(ir, TR_HASH, CONF_HASH, shardPath, new UnicityTreeCertificate(partition, steps), seal);
}

async function outcomeFor(
  ir: InputRecord,
  certificate = EMPTY,
  steps: HashStep[] = [],
  partition: bigint = PARTITION,
): Promise<{ message: string; snapshot: unknown; verdict: string }> {
  const uc = await signedUc(ir, steps, partition);
  const wrapper = CborSerializer.encodeArray(
    CborSerializer.encodeUnsignedInteger(100n),
    CborSerializer.encodeTag(
      NonInclusionProof.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(NonInclusionProof.VERSION),
        CborSerializer.encodeByteString(certificate),
        uc.toCBOR(),
      ),
    ),
  );
  const result = await verifyNonInclusion(NonInclusionProof.decode(QUERY, wrapper), {
    trustBase,
    unicityCertificateVerifier: verifier,
  });
  return { message: result.reason, snapshot: result.snapshot, verdict: result.verdict };
}

async function verdictFor(ir: InputRecord, certificate = EMPTY): Promise<string> {
  return (await outcomeFor(ir, certificate)).verdict;
}

describe('nullable input record in the non-inclusion security path', () => {
  it('keeps null, empty and a value distinct through a round trip', () => {
    for (const hash of [null, EMPTY, new Uint8Array(32).fill(1)]) {
      for (const summary of [null, EMPTY, new Uint8Array([1])]) {
        const ir = inputRecord({ hash, summary });
        const decoded = InputRecord.fromCBOR(ir.toCBOR());
        expect(decoded.toCBOR()).toEqual(ir.toCBOR());
        expect(decoded.nullableHash === null).toEqual(hash === null);
        expect(decoded.nullableSummaryValue === null).toEqual(summary === null);
      }
    }
    // the deprecated getters cannot tell them apart, which is why no verification path reads them
    expect(inputRecord({ hash: null }).hash).toEqual(inputRecord({ hash: EMPTY }).hash);
  });

  it('accepts a signed initial empty tree (hash null, round 0, summary null)', async () => {
    expect(await verdictFor(inputRecord({ hash: null }))).toEqual('absent_at_snapshot');
  });

  it('accepts a signed nonzero-round empty tree with null hash and a valid summary', async () => {
    expect(await verdictFor(inputRecord({ hash: null, round: 3n, summary: EMPTY, timestamp: 1700000000n }))).toEqual(
      'absent_at_snapshot',
    );
  });

  it('rejects an independently signed unicity certificate whose hash is the empty byte string', async () => {
    // the signature, shard path and seal hash are all valid for this record: only the representation is wrong
    const uc = await signedUc(inputRecord({ hash: EMPTY }));
    const session = new SealVerificationSession(
      trustBase,
      new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
    );
    expect((await session.authenticate(uc.unicitySeal)).status).toEqual(VerificationStatus.OK);
    expect(await outcomeFor(inputRecord({ hash: EMPTY }))).toEqual({
      message: 'The state root must be null (the empty tree) or 32 bytes.',
      snapshot: null,
      verdict: 'uc_invalid',
    });
  });

  it('rejects an independently signed zero hash as the empty root', async () => {
    expect(await outcomeFor(inputRecord({ hash: new Uint8Array(32) }))).toEqual({
      message: 'The path is invalid.',
      snapshot: null,
      verdict: 'certificate_invalid',
    });
  });

  it('rejects the empty certificate against a signed nonempty root, and a nonempty hash of the wrong length', async () => {
    expect(await verdictFor(inputRecord({ hash: new Uint8Array(32).fill(9) }))).toEqual('certificate_invalid');
    expect(await outcomeFor(inputRecord({ hash: new Uint8Array(31).fill(9) }))).toEqual({
      message: 'The state root must be null (the empty tree) or 32 bytes.',
      snapshot: null,
      verdict: 'uc_invalid',
    });
  });
  describe('input record structure, as bft-go-base InputRecord.IsValid (reject the malformed combinations, not every null field)', () => {
    const H = new Uint8Array(32).fill(9);
    const B = new Uint8Array(32).fill(5);
    const T = 1700000000n;

    it('accepts the legal null fields: a null summary at round 0, an empty block hash for an unchanged state', async () => {
      expect(await verdictFor(inputRecord({ hash: null }))).toEqual('absent_at_snapshot');
      expect(await verdictFor(inputRecord({ blockHash: EMPTY, hash: null }))).toEqual('absent_at_snapshot');
      expect(await verdictFor(inputRecord({ blockHash: B, hash: H }))).not.toEqual('uc_invalid');
    });

    it.each([
      ['a nil summary value from round 1', { blockHash: B, hash: H, round: 1n, summary: null, timestamp: T }],
      ['an unassigned timestamp from round 1', { blockHash: B, hash: H, round: 1n, summary: EMPTY, timestamp: 0n }],
      ['a nil block hash although the state hash changed', { blockHash: null, hash: H }],
      ['an empty block hash although the state hash changed', { blockHash: EMPTY, hash: H }],
      ['a block hash although the state hash did not change', { blockHash: B, hash: null }],
    ])('rejects %s as uc_invalid', async (_name, ir) => {
      const outcome = await outcomeFor(inputRecord(ir));
      expect(outcome.verdict).toEqual('uc_invalid');
      expect(outcome.message).toContain('The input record is malformed');
    });
  });

  it('rejects a validly signed certificate of another partition, with no snapshot metadata', async () => {
    for (const partition of [0n, 6n, 8n, 161n, 0xffffffffn]) {
      await expect(outcomeFor(inputRecord({ hash: null }), EMPTY, [], partition)).resolves.toEqual({
        message: 'The certificate is not of the aggregation partition.',
        snapshot: null,
        verdict: 'uc_invalid',
      });
    }
    // control: the same record under partition 7 is a verified absence with its snapshot
    const accepted = await outcomeFor(inputRecord({ hash: null }));
    expect(accepted.verdict).toEqual('absent_at_snapshot');
    expect(accepted.snapshot).not.toBeNull();
  });

  it('classifies a partition path step key of 2^32 or more as uc_invalid, never a throw', async () => {
    for (const key of [2n ** 32n, 2n ** 32n + 161n, 2n ** 64n - 1n]) {
      await expect(
        outcomeFor(inputRecord({ hash: null }), EMPTY, [new HashStep(key, new Uint8Array(32))]),
      ).resolves.toEqual({
        message: 'The partition path has a nil step or a step key beyond 32 bits.',
        snapshot: null,
        verdict: 'uc_invalid',
      });
    }
  });
});
