import { UnicityCertificate } from './bft/UnicityCertificate.js';
import { CertificationData } from './CertificationData.js';
import { InclusionCertificate } from './InclusionCertificate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Represents a proof of inclusion or non inclusion in a sparse merkle tree.
 */
export class InclusionProof {
  /**
   * Constructs an InclusionProof instance.
   * @param certificationData Certification data.
   * @param inclusionCertificate Inclusion certificate.
   * @param unicityCertificate Unicity certificate.
   */
  public constructor(
    public readonly certificationData: CertificationData | null,
    public readonly inclusionCertificate: InclusionCertificate | null,
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
      CborDeserializer.decodeNullable(data[0], CertificationData.fromCBOR),
      CborDeserializer.decodeNullable(data[1], (inclusionCertificate) =>
        InclusionCertificate.decode(CborDeserializer.decodeByteString(inclusionCertificate)),
      ),
      UnicityCertificate.fromCBOR(data[2]),
    );
  }

  /**
   * Encodes the InclusionProof to CBOR format.
   * @returns The CBOR-encoded bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeNullable(this.certificationData, (certificationData) => certificationData.toCBOR()),
      CborSerializer.encodeNullable(this.inclusionCertificate, (inclusionCertificate) =>
        CborSerializer.encodeByteString(inclusionCertificate.encode()),
      ),
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
        ${this.inclusionCertificate?.toString()}
        ${this.certificationData?.toString()}
        ${this.unicityCertificate.toString()}`;
  }
}
