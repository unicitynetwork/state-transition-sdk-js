import { Authenticator, IAuthenticatorJson } from '../api/Authenticator.js';
import { LeafValue } from '../api/LeafValue.js';
import { RequestId } from '../api/RequestId.js';
import { DataHash } from '../hash/DataHash.js';
import { IMerkleTreePathJson, MerkleTreePath } from '../mtree/plain/MerkleTreePath.js';
import { CborDecoder } from '../serializer/cbor/CborDecoder.js';
import { CborEncoder } from '../serializer/cbor/CborEncoder.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Interface representing the JSON structure of an InclusionProof.
 */
export interface IInclusionProofJson {
  /** The sparse merkle tree path as JSON. */
  readonly merkleTreePath: IMerkleTreePathJson;
  /** The authenticator as JSON or null. */
  readonly authenticator: IAuthenticatorJson | null;
  /** The transaction hash as a string or null. */
  readonly transactionHash: string | null;
}

/**
 * Status codes for verifying an InclusionProof.
 */
export enum InclusionProofVerificationStatus {
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
   * @param authenticator Authenticator.
   * @param transactionHash Transaction hash.
   * @throws Error if authenticator and transactionHash are not both set or both null.
   */
  public constructor(
    public readonly merkleTreePath: MerkleTreePath,
    public readonly authenticator: Authenticator | null,
    public readonly transactionHash: DataHash | null,
  ) {
    if (!this.authenticator != !this.transactionHash) {
      throw new Error('Authenticator and transaction hash must be both set or both null.');
    }
  }

  /**
   * Type guard to check if data is IInclusionProofJson.
   * @param data The data to check.
   * @returns True if data is IInclusionProofJson, false otherwise.
   */
  public static isJSON(data: unknown): data is IInclusionProofJson {
    return typeof data === 'object' && data !== null && 'merkleTreePath' in data;
  }

  /**
   * Creates an InclusionProof from a JSON object.
   * @param data The JSON data.
   * @returns An InclusionProof instance.
   * @throws Error if parsing fails.
   */
  public static fromJSON(data: unknown): InclusionProof {
    if (!InclusionProof.isJSON(data)) {
      throw new Error('Parsing inclusion proof json failed.');
    }

    return new InclusionProof(
      MerkleTreePath.fromJSON(data.merkleTreePath),
      data.authenticator ? Authenticator.fromJSON(data.authenticator) : null,
      data.transactionHash ? DataHash.fromJSON(data.transactionHash) : null,
    );
  }

  /**
   * Decodes an InclusionProof from CBOR bytes.
   * @param bytes The CBOR-encoded bytes.
   * @returns An InclusionProof instance.
   */
  public static fromCBOR(bytes: Uint8Array): InclusionProof {
    const data = CborDecoder.readArray(bytes);
    const authenticator = CborDecoder.readOptional(data[1], Authenticator.fromCBOR);
    const transactionHash = CborDecoder.readOptional(data[2], DataHash.fromCBOR);

    return new InclusionProof(MerkleTreePath.fromCBOR(data[0]), authenticator, transactionHash);
  }

  /**
   * Converts the InclusionProof to a JSON object.
   * @returns The InclusionProof as IInclusionProofJson.
   */
  public toJSON(): IInclusionProofJson {
    return {
      authenticator: this.authenticator?.toJSON() ?? null,
      merkleTreePath: this.merkleTreePath.toJSON(),
      transactionHash: this.transactionHash?.toJSON() ?? null,
    };
  }

  /**
   * Encodes the InclusionProof to CBOR format.
   * @returns The CBOR-encoded bytes.
   */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      this.merkleTreePath.toCBOR(),
      this.authenticator?.toCBOR() ?? CborEncoder.encodeNull(),
      this.transactionHash?.toCBOR() ?? CborEncoder.encodeNull(),
    ]);
  }

  /**
   * Verifies the inclusion proof for a given request ID.
   * @param requestId The request ID.
   * @returns A Promise resolving to the verification status.
   */
  public async verify(requestId: RequestId): Promise<InclusionProofVerificationStatus> {
    const result = await this.merkleTreePath.verify(requestId.toBitString().toBigInt());
    if (!result.isPathValid) {
      return InclusionProofVerificationStatus.PATH_INVALID;
    }

    if (this.authenticator && this.transactionHash) {
      if (!(await this.authenticator.verify(this.transactionHash))) {
        return InclusionProofVerificationStatus.NOT_AUTHENTICATED;
      }

      const leafValue = await LeafValue.create(this.authenticator, this.transactionHash);
      if (!leafValue.equals(this.merkleTreePath.steps.at(0)?.branch?.value)) {
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
        ${this.authenticator?.toString()}
        Transaction Hash: ${this.transactionHash?.toString() ?? null}`;
  }
}
