import { UnicityCertificate } from './bft/UnicityCertificate.js';
import { CertificationData } from './CertificationData.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { SparseMerkleTreePath } from '../smt/plain/SparseMerkleTreePath.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Represents a proof of inclusion or non inclusion in a sparse merkle tree.
 */
export class InclusionProof {
  /**
   * Constructs an InclusionProof instance.
   * @param merkleTreePath Sparse merkle tree path.
   * @param certificationData Certification data.
   * @param unicityCertificate Unicity certificate.
   */
  public constructor(
    public readonly merkleTreePath: SparseMerkleTreePath,
    public readonly certificationData: CertificationData | null,
    public readonly unicityCertificate: UnicityCertificate,
  ) {}

  /**
   * Decodes an InclusionProof from CBOR bytes.
   * @param bytes The CBOR-encoded bytes.
   * @returns An InclusionProof instance.
   */
  public static fromCBOR(bytes: Uint8Array): InclusionProof {
    const data = CborDeserializer.decodeArray(bytes);

    return new InclusionProof(
      SparseMerkleTreePath.fromCBOR(data[1]),
      CborDeserializer.decodeNullable(data[0], CertificationData.fromCBOR),
      UnicityCertificate.fromCBOR(data[2]),
    );
  }

  /**
   * Encodes the InclusionProof to CBOR format.
   * @returns The CBOR-encoded bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.certificationData?.toCBOR() ?? CborSerializer.encodeNull(),
      this.merkleTreePath.toCBOR(),
      this.unicityCertificate.toCBOR(),
    );
  }

  /**
   * Returns a string representation of the InclusionProof.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Inclusion Proof
        ${this.merkleTreePath.toString()}
        ${this.certificationData?.toString()}
        ${this.unicityCertificate.toString()}`;
  }
}
