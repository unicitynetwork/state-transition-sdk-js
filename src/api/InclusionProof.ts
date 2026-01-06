import { UnicityCertificate } from './bft/UnicityCertificate.js';
import { CertificationData, ICertificationDataJson } from './CertificationData.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { ISparseMerkleTreePathJson, SparseMerkleTreePath } from '../smt/plain/SparseMerkleTreePath.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Interface representing the JSON structure of an InclusionProof.
 */
export interface IInclusionProofJson {
  /** The certification data as JSON or null. */
  readonly certificationData: ICertificationDataJson | null;
  /** The sparse merkle tree path as JSON. */
  readonly merkleTreePath: ISparseMerkleTreePathJson;
  /** The unicity certificate as a hex string. */
  readonly unicityCertificate: string;
}

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
      SparseMerkleTreePath.fromCBOR(data[0]),
      CborDeserializer.decodeNullable(data[1], CertificationData.fromCBOR),
      UnicityCertificate.fromCBOR(data[2]),
    );
  }

  /**
   * Creates an InclusionProof from a JSON object.
   * @param data The JSON data.
   * @returns An InclusionProof instance.
   * @throws Error if parsing fails.
   */
  public static fromJSON(data: unknown): InclusionProof {
    if (!InclusionProof.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new InclusionProof(
      SparseMerkleTreePath.fromJSON(data.merkleTreePath),
      data.certificationData ? CertificationData.fromJSON(data.certificationData) : null,
      UnicityCertificate.fromJSON(data.unicityCertificate),
    );
  }

  /**
   * Type guard to check if data is IInclusionProofJson.
   * @param data The data to check.
   * @returns True if data is IInclusionProofJson, false otherwise.
   */
  public static isJSON(data: unknown): data is IInclusionProofJson {
    return typeof data === 'object' && data !== null && 'merkleTreePath' in data && 'unicityCertificate' in data;
  }

  /**
   * Encodes the InclusionProof to CBOR format.
   * @returns The CBOR-encoded bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.merkleTreePath.toCBOR(),
      this.certificationData?.toCBOR() ?? CborSerializer.encodeNull(),
      this.unicityCertificate.toCBOR(),
    );
  }

  /**
   * Converts the InclusionProof to a JSON object.
   * @returns The InclusionProof as IInclusionProofJson.
   */
  public toJSON(): IInclusionProofJson {
    return {
      certificationData: this.certificationData?.toJSON() ?? null,
      merkleTreePath: this.merkleTreePath.toJSON(),
      unicityCertificate: this.unicityCertificate.toJSON(),
    };
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
