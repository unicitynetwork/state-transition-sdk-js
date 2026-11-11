import { UnicityCertificate } from '../../../../src/api/bft/UnicityCertificate.js';
import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { UnicityCertificateVerifier } from '../../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { InclusionProof } from '../../../../src/api/InclusionProof.js';
import { DataHash } from '../../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../../src/crypto/hash/HashAlgorithm.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { CborDeserializer } from '../../../../src/serialization/cbor/CborDeserializer.js';
import { CborMap } from '../../../../src/serialization/cbor/CborMap.js';
import { CborMapEntry } from '../../../../src/serialization/cbor/CborMapEntry.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { createTrustBaseHistory } from '../../../utils/TrustBaseHistoryFixture.js';
import { createUnicityCertificate } from '../../../utils/UnicityCertificateFixture.js';
import { createUnicityCertificateVerifier } from '../../../utils/UnicityCertificateVerifierFixture.js';

const NODE = new SigningService(new Uint8Array(32).fill(1));

/** The seal with another witness map (re-encoded, so the map may hold what the constructors would not build). */
function withWitnesses(seal: UnicitySeal, witnesses: Map<string, Uint8Array>): UnicitySeal {
  const tag = CborDeserializer.decodeTag(seal.toCBOR());
  const fields = CborDeserializer.decodeArray(tag.data, 8);
  fields[7] = CborSerializer.encodeMap(
    new CborMap(
      Array.from(witnesses.entries()).map(
        ([key, value]) =>
          new CborMapEntry(CborSerializer.encodeTextString(key), CborSerializer.encodeByteString(value)),
      ),
    ),
  );
  return UnicitySeal.fromCBOR(CborSerializer.encodeTag(tag.tag, CborSerializer.encodeArray(...fields)));
}

function junk(length: number, recovery?: number): Uint8Array {
  const bytes = new Uint8Array(length).fill(7);
  if (recovery !== undefined) {
    bytes[64] = recovery;
  }
  return bytes;
}

/**
 * The seal rows of the differential against Go (rev3, js#16): a valid quorum plus one extra witness. A malformed witness of any width is zero votes
 * and does not veto the seal; an empty signer id or an empty witness fails the native structure rule, on the plain and the operation verifier alike.
 */
describe('a seal with one extra witness next to a valid quorum', () => {
  const rows: [string, [string, Uint8Array][], VerificationStatus][] = [
    ['no extra witness', [], VerificationStatus.OK],
    ['66 bytes', [['X', junk(66)]], VerificationStatus.OK],
    ['64 bytes', [['X', junk(64)]], VerificationStatus.OK],
    ['65 bytes with recovery id 4', [['X', junk(65, 4)]], VerificationStatus.OK],
    ['65 bytes with recovery id 255', [['X', junk(65, 255)]], VerificationStatus.OK],
    ['an empty witness', [['X', new Uint8Array(0)]], VerificationStatus.FAIL],
    ['an empty signer id with a junk witness', [['', junk(65, 0)]], VerificationStatus.FAIL],
    ['an empty signer id with an empty witness', [['', new Uint8Array(0)]], VerificationStatus.FAIL],
  ];
  const verifiers: [string, () => UnicityCertificateVerifier][] = [
    ['plain verifier', (): UnicityCertificateVerifier => createUnicityCertificateVerifier()],
    ['operation verifier', (): UnicityCertificateVerifier => createUnicityCertificateVerifier().beginOperation()],
  ];

  describe.each(verifiers)('%s', (_name, make) => {
    it.each(rows)('%s', async (_row, extra, expected) => {
      const history = await createTrustBaseHistory(NODE.publicKey);
      const base = await createUnicityCertificate(new DataHash(HashAlgorithm.SHA256, new Uint8Array(32).fill(5)), NODE);
      const seal = base.unicitySeal;
      const witnesses = new Map<string, Uint8Array>([['NODE', seal.witnesses?.get('NODE') as Uint8Array], ...extra]);
      const certificate = new UnicityCertificate(
        base.inputRecord,
        base.technicalRecordHash,
        base.shardConfigurationHash,
        base.shardTreeCertificate,
        base.unicityTreeCertificate,
        withWitnesses(seal, witnesses),
      );
      const result = await make().verify(history, { unicityCertificate: certificate } as unknown as InclusionProof);
      expect(result.status).toBe(expected);
    });
  });
});
