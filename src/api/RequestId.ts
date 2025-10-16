import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { BitString } from '../util/BitString.js';

/**
 * Represents a unique request identifier derived from a public key and state hash.
 */
export class RequestId extends DataHash {
  /**
   * Constructs a RequestId instance.
   * @param hash The DataHash representing the request ID.
   */
  private constructor(public readonly hash: DataHash) {
    super(hash.algorithm, hash.data);
  }

  /**
   * Creates a RequestId from a public key and state hash.
   * @param id The public key as a Uint8Array.
   * @param stateHash The state hash.
   * @returns A Promise resolving to a RequestId instance.
   */
  public static create(id: Uint8Array, stateHash: DataHash): Promise<RequestId> {
    return RequestId.createFromImprint(id, stateHash.imprint);
  }

  /**
   * Creates a RequestId from a public key and hash imprint.
   * @param id The public key as a Uint8Array.
   * @param hashImprint The hash imprint as a Uint8Array.
   * @returns A Promise resolving to a RequestId instance.
   */
  public static async createFromImprint(id: Uint8Array, hashImprint: Uint8Array): Promise<RequestId> {
    const hash = await new DataHasher(HashAlgorithm.SHA256).update(id).update(hashImprint).digest();
    return new RequestId(hash);
  }

  /**
   * Decodes a RequestId from CBOR bytes.
   * @param data The CBOR-encoded bytes.
   * @returns A RequestId instance.
   */
  public static fromCBOR(data: Uint8Array): RequestId {
    return new RequestId(DataHash.fromCBOR(data));
  }

  /**
   * Creates a RequestId from a JSON string.
   * @param data The JSON string.
   * @returns A RequestId instance.
   */
  public static fromJSON(data: string): RequestId {
    return new RequestId(DataHash.fromJSON(data));
  }

  /**
   * Converts the RequestId to a BitString.
   * @return The BitString representation of the RequestId.
   */
  public toBitString(): BitString {
    return BitString.fromDataHash(this);
  }

  /**
   * Returns a string representation of the RequestId.
   * @returns The string representation.
   */
  public toString(): string {
    return `RequestId[${this.hash.toString()}]`;
  }
}
