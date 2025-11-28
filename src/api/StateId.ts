import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { BitString } from '../util/BitString.js';

/**
 * Represents a unique state identifier derived from a public key and state hash.
 */
export class StateId extends DataHash {
  /**
   * Constructs a StateId instance.
   * @param hash The DataHash representing the state ID.
   */
  private constructor(public readonly hash: DataHash) {
    super(hash.algorithm, hash.data);
  }

  /**
   * Creates a StateId from a public key and state hash.
   * @param publicKey The public key as a Uint8Array.
   * @param stateHash The state hash.
   * @returns A Promise resolving to a StateId instance.
   */
  public static create(publicKey: Uint8Array, stateHash: DataHash): Promise<StateId> {
    return StateId.createFromImprint(publicKey, stateHash.imprint);
  }

  /**
   * Creates a StateId from a public key and hash imprint.
   * @param publicKey The public key as a Uint8Array.
   * @param hashImprint The hash imprint as a Uint8Array.
   * @returns A Promise resolving to a StateId instance.
   */
  public static async createFromImprint(publicKey: Uint8Array, hashImprint: Uint8Array): Promise<StateId> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(hashImprint),
          CborSerializer.encodeByteString(publicKey),
        ),
      )
      .digest();
    return new StateId(hash);
  }

  /**
   * Decodes a StateId from CBOR bytes.
   * @param data The CBOR-encoded bytes.
   * @returns A StateId instance.
   */
  public static fromCBOR(data: Uint8Array): StateId {
    return new StateId(DataHash.fromCBOR(data));
  }

  /**
   * Creates a StateId from a JSON string.
   * @param data The JSON string.
   * @returns A StateId instance.
   */
  public static fromJSON(data: string): StateId {
    return new StateId(DataHash.fromJSON(data));
  }

  /**
   * Converts the StateId to a BitString.
   * @return The BitString representation of the StateId.
   */
  public toBitString(): BitString {
    return BitString.fromDataHash(this);
  }

  /**
   * Returns a string representation of the StateId.
   * @returns The string representation.
   */
  public toString(): string {
    return `StateId[${this.hash.toString()}]`;
  }
}
