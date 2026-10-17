import { InputRecord } from '../../../src/api/bft/InputRecord.js';
import { RootTrustBase } from '../../../src/api/bft/RootTrustBase.js';
import { ShardId } from '../../../src/api/bft/ShardId.js';
import { ShardTreeCertificate } from '../../../src/api/bft/ShardTreeCertificate.js';
import { UnicityCertificate } from '../../../src/api/bft/UnicityCertificate.js';
import { UnicitySeal } from '../../../src/api/bft/UnicitySeal.js';
import { UnicityTreeCertificate } from '../../../src/api/bft/UnicityTreeCertificate.js';
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
import { HexConverter } from '../../../src/util/HexConverter.js';
import { VerificationStatus } from '../../../src/verification/VerificationStatus.js';

// Architect ruling "Empty-tree ruling" §5: the authenticated empty tree is exactly IR hash = null. An empty byte string,
// a zero hash and every other representation are not aliases of it, also when a quorum signed that very certificate.

const PARTITION = 161n;
const NODE = new SigningService(new Uint8Array(32).fill(7));
const QUERY = StateId.fromCBOR(CborSerializer.encodeByteString(new Uint8Array(32).fill(0xac)));
const TR_HASH = new Uint8Array(32).fill(0x33);
const CONF_HASH = new Uint8Array(32).fill(0x44);
const EMPTY = new Uint8Array(0);

const trustBase = RootTrustBase.fromJSON({
  changeRecordHash: null,
  epoch: '0',
  epochStartRound: '0',
  networkId: NetworkId.LOCAL.id,
  previousEntryHash: null,
  quorumThreshold: '1',
  rootNodes: [{ nodeId: 'NODE', sigKey: HexConverter.encode(NODE.publicKey), stake: '1' }],
  signatures: {},
  stateHash: '00',
  version: '1',
});
const verifier = new UnicityCertificateVerifier(
  new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
);

function inputRecord(options: {
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
    null,
    0n,
    null,
  );
}

/** A unicity certificate for the unsharded partition whose seal is signed over exactly this input record. */
async function signedUc(ir: InputRecord): Promise<UnicityCertificate> {
  const shardPath = new ShardTreeCertificate(ShardId.fromBits(''), []);
  const shardRoot = await UnicityCertificate.calculateShardTreeCertificateRootHash(ir, TR_HASH, CONF_HASH, shardPath);
  const treeHash = await new DataHasher(HashAlgorithm.SHA256)
    .update(CborSerializer.encodeByteString(shardRoot.data))
    .digest();
  const key = new Uint8Array([0, 0, 0, Number(PARTITION)]);
  const sealHash = await new DataHasher(HashAlgorithm.SHA256)
    .update(CborSerializer.encodeByteString(new Uint8Array([0x01])))
    .update(CborSerializer.encodeByteString(key))
    .update(CborSerializer.encodeByteString(treeHash.data))
    .digest();
  const seal = await UnicitySeal.create(
    NetworkId.LOCAL,
    5n,
    0n,
    1700000000n,
    null,
    sealHash.data,
    new Map([['NODE', NODE]]),
  );
  return new UnicityCertificate(ir, TR_HASH, CONF_HASH, shardPath, new UnicityTreeCertificate(PARTITION, []), seal);
}

async function outcomeFor(ir: InputRecord, certificate = EMPTY): Promise<{ message: string; verdict: string }> {
  const uc = await signedUc(ir);
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
  const result = await verifyNonInclusion(
    NonInclusionProof.decode(QUERY, wrapper),
    { trustBase, unicityCertificateVerifier: verifier },
    { expectedPartition: PARTITION },
  );
  return { message: result.message, verdict: result.verdict };
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
    expect(await verdictFor(inputRecord({ hash: null }))).toEqual('absent');
  });

  it('accepts a signed nonzero-round empty tree with null hash and a valid summary', async () => {
    expect(await verdictFor(inputRecord({ hash: null, round: 3n, summary: EMPTY, timestamp: 1700000000n }))).toEqual(
      'absent',
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
      verdict: 'uc_invalid',
    });
  });

  it('rejects an independently signed zero hash as the empty root', async () => {
    expect(await outcomeFor(inputRecord({ hash: new Uint8Array(32) }))).toEqual({
      message: 'The path is invalid.',
      verdict: 'certificate_invalid',
    });
  });

  it('rejects the empty certificate against a signed nonempty root, and a nonempty hash of the wrong length', async () => {
    expect(await verdictFor(inputRecord({ hash: new Uint8Array(32).fill(9) }))).toEqual('certificate_invalid');
    expect(await outcomeFor(inputRecord({ hash: new Uint8Array(31).fill(9) }))).toEqual({
      message: 'The state root must be null (the empty tree) or 32 bytes.',
      verdict: 'uc_invalid',
    });
  });
});
