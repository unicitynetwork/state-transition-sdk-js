import { Authenticator } from './Authenticator.js';
import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Represents the value of a leaf node in a sparse merkle tree, derived from an authenticator and transaction hash.
 */
export class LeafValue {
  /**
   * Constructs a LeafValue instance.
   * @param _bytes The bytes representing the leaf value.
   */
  private constructor(private readonly _bytes: Uint8Array) {
    this._bytes = new Uint8Array(_bytes);
  }

  /**
   * Gets a copy of the bytes representing the leaf value.
   * @returns The bytes as a Uint8Array.
   */
  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  /**
   * Creates a LeafValue from an authenticator and transaction hash.
   * @param authenticator The authenticator.
   * @param transactionHash The transaction hash.
   * @returns A Promise resolving to a LeafValue instance.
   */
  public static async create(authenticator: Authenticator, transactionHash: DataHash): Promise<LeafValue> {
    // TODO: Create cbor object to calculate hash so it would be consistent with everything else?
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(authenticator.toCBOR())
      .update(transactionHash.imprint)
      .digest();

    return new LeafValue(hash.imprint);
  }

  /**
   * Checks if the given data is equal to this leaf value.
   * @param data The data to compare (ArrayBufferView).
   * @returns True if equal, false otherwise.
   */
  public equals(data: unknown): boolean {
    if (ArrayBuffer.isView(data)) {
      return (
        HexConverter.encode(this.bytes) ===
        HexConverter.encode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
      );
    }

    return false;
  }

  /**
   * Returns a string representation of the LeafValue.
   * @returns The string representation.
   */
  public toString(): string {
    return `LeafValue[${HexConverter.encode(this.bytes)}]`;
  }
}
