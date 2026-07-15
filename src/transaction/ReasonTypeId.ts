import { DataHasher } from '../hash/DataHasher.js';
import { DataHasherFactory } from '../hash/DataHasherFactory.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Represents a 32-byte identifier for a mint transaction reason type.
 * Type IDs are typically derived by hashing a string identifier.
 */
export class ReasonTypeId {
  private static readonly BYTE_LENGTH = 32;

  /**
   * Create a ReasonTypeId from a 32-byte array.
   * @param id The 32-byte identifier
   */
  private constructor(private readonly id: Uint8Array) {
    if (id.length !== ReasonTypeId.BYTE_LENGTH) {
      throw new Error(`Reason type ID must be exactly ${ReasonTypeId.BYTE_LENGTH} bytes, got ${id.length}`);
    }
  }

  /**
   * Generate a ReasonTypeId by SHA-256 hashing a string identifier.
   * @param identifier String to hash (e.g., 'TOKEN_SPLIT')
   * @returns ReasonTypeId derived from the hash
   */
  public static async fromString(identifier: string): Promise<ReasonTypeId> {
    const hasherFactory = new DataHasherFactory(HashAlgorithm.SHA256, DataHasher);
    const hasher = hasherFactory.create();
    const textEncoder = new TextEncoder();
    const dataHash = await hasher.update(textEncoder.encode(identifier)).digest();
    return new ReasonTypeId(dataHash.imprint);
  }

  /**
   * Create a ReasonTypeId from a 32-byte array.
   * @param bytes The 32-byte identifier
   * @returns ReasonTypeId
   */
  public static fromBytes(bytes: Uint8Array): ReasonTypeId {
    return new ReasonTypeId(new Uint8Array(bytes));
  }

  /**
   * Get the raw 32-byte identifier.
   * @returns Copy of the byte array
   */
  public toBytes(): Uint8Array {
    return new Uint8Array(this.id);
  }

  /**
   * Convert to hex string representation.
   * @returns Hex string (64 characters)
   */
  public toHexString(): string {
    return HexConverter.encode(this.id);
  }

  /**
   * Check equality with another ReasonTypeId.
   * @param other ReasonTypeId to compare
   * @returns true if equal
   */
  public equals(other: ReasonTypeId): boolean {
    if (this.id.length !== other.id.length) {
      return false;
    }
    for (let i = 0; i < this.id.length; i++) {
      if (this.id[i] !== other.id[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Serialize to CBOR.
   * @returns CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this.id);
  }

  /**
   * Deserialize from CBOR.
   * @param bytes CBOR bytes
   * @returns ReasonTypeId
   */
  public static fromCBOR(bytes: Uint8Array): ReasonTypeId {
    const id = CborDeserializer.readByteString(bytes);
    return new ReasonTypeId(id);
  }

  /**
   * Serialize to JSON (hex string).
   * @returns Hex string
   */
  public toJSON(): string {
    return this.toHexString();
  }

  /**
   * Deserialize from JSON (hex string).
   * @param hex Hex string
   * @returns ReasonTypeId
   */
  public static fromJSON(hex: string): ReasonTypeId {
    const bytes = HexConverter.decode(hex);
    return new ReasonTypeId(bytes);
  }
}
