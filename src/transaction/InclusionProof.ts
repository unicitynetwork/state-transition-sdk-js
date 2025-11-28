import { CertificationData, ICertificationDataJson } from '../api/CertificationData.js';
import { StateId } from '../api/StateId.js';
import { RootTrustBase } from '../bft/RootTrustBase.js';
import { UnicityCertificate } from '../bft/UnicityCertificate.js';
import { UnicityCertificateVerificationContext } from '../bft/verification/UnicityCertificateVerificationContext.js';
import { UnicityCertificateVerificationRule } from '../bft/verification/UnicityCertificateVerificationRule.js';
import { DataHash } from '../hash/DataHash.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { ISparseMerkleTreePathJson, SparseMerkleTreePath } from '../mtree/plain/SparseMerkleTreePath.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Interface representing the JSON structure of an InclusionProof.
 */
export interface IInclusionProofJson {
  /** The sparse merkle tree path as JSON. */
  readonly merkleTreePath: ISparseMerkleTreePathJson;
  /** The authenticator as JSON or null. */
  readonly certificationData: ICertificationDataJson | null;
  /** The unicity certificate as a hex string. */
  readonly unicityCertificate: string;
}

/**
 * Status codes for verifying an InclusionProof.
 */
export enum InclusionProofVerificationStatus {
  INVALID_TRUSTBASE = 'INVALID_TRUSTBASE',
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  PATH_NOT_INCLUDED = 'PATH_NOT_INCLUDED',
  PATH_INVALID = 'PATH_INVALID',
  OK = 'OK',
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
   * @throws Error if authenticator and transactionHash are not both set or both null.
   */
  public constructor(
    public readonly merkleTreePath: SparseMerkleTreePath,
    public readonly certificationData: CertificationData | null,
    public readonly unicityCertificate: UnicityCertificate,
  ) {}

  /**
   * Type guard to check if data is IInclusionProofJson.
   * @param data The data to check.
   * @returns True if data is IInclusionProofJson, false otherwise.
   */
  public static isJSON(data: unknown): data is IInclusionProofJson {
    return typeof data === 'object' && data !== null && 'merkleTreePath' in data && 'unicityCertificate' in data;
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
   * Decodes an InclusionProof from CBOR bytes.
   * @param bytes The CBOR-encoded bytes.
   * @returns An InclusionProof instance.
   */
  public static fromCBOR(bytes: Uint8Array): InclusionProof {
    const data = CborDeserializer.readArray(bytes);

    return new InclusionProof(
      SparseMerkleTreePath.fromCBOR(data[0]),
      CborDeserializer.readOptional(data[1], CertificationData.fromCBOR),
      UnicityCertificate.fromCBOR(data[2]),
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
   * Verifies the inclusion proof for a given state ID.
   * @param trustBase The root trust base.
   * @param stateId The state ID.
   * @returns A Promise resolving to the verification status.
   */
  public async verify(trustBase: RootTrustBase, stateId: StateId): Promise<InclusionProofVerificationStatus> {
    const unicityCertificateVerificationResult = await new UnicityCertificateVerificationRule().verify(
      new UnicityCertificateVerificationContext(this.merkleTreePath.root, this.unicityCertificate, trustBase),
    );

    if (!unicityCertificateVerificationResult.isSuccessful) {
      return InclusionProofVerificationStatus.INVALID_TRUSTBASE;
    }

    const result = await this.merkleTreePath.verify(stateId.toBitString().toBigInt());
    if (!result.isPathValid) {
      return InclusionProofVerificationStatus.PATH_INVALID;
    }

    if (this.certificationData) {
      if (!(await this.certificationData.verify())) {
        return InclusionProofVerificationStatus.NOT_AUTHENTICATED;
      }

      const leafValue = await this.certificationData.calculateLeafValue();
      const pathValue = this.merkleTreePath.steps.at(0)?.data;
      if (!pathValue || !leafValue.equals(DataHash.fromImprint(pathValue))) {
        return InclusionProofVerificationStatus.PATH_NOT_INCLUDED;
      }
    }

    if (!result.isPathIncluded) {
      return InclusionProofVerificationStatus.PATH_NOT_INCLUDED;
    }

    return InclusionProofVerificationStatus.OK;
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
