import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

/**
 * 32-byte salt mixed with a network identifier to derive a {@link TokenId}.
 */
export class TokenSalt {
  public static readonly LENGTH = 32;

  private constructor(private readonly _bytes: Uint8Array) {}

  /**
   * Wrap an existing 32-byte salt.
   *
   * @param {Uint8Array} bytes Salt bytes; must be exactly 32 bytes.
   * @returns {TokenSalt} New salt.
   * @throws {Error} If `bytes` is not 32 bytes long.
   */
  public static fromBytes(bytes: Uint8Array): TokenSalt {
    if (bytes.length !== TokenSalt.LENGTH) {
      throw new Error(`TokenSalt must be ${TokenSalt.LENGTH} bytes long, got ${bytes.length}.`);
    }
    return new TokenSalt(new Uint8Array(bytes));
  }

  /**
   * Create TokenSalt from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {TokenSalt} Decoded salt.
   */
  public static fromCBOR(bytes: Uint8Array): TokenSalt {
    return TokenSalt.fromBytes(CborDeserializer.decodeByteString(bytes));
  }

  /**
   * Generate a fresh random 32-byte TokenSalt.
   *
   * @returns {TokenSalt} New random salt.
   */
  public static generate(): TokenSalt {
    return new TokenSalt(crypto.getRandomValues(new Uint8Array(TokenSalt.LENGTH)));
  }

  /**
   * Equality check against another value.
   *
   * @param {unknown} o Other value.
   * @returns {boolean} True if `o` is a TokenSalt with the same bytes.
   */
  public equals(o: unknown): boolean {
    if (this === o) {
      return true;
    }
    if (!(o instanceof TokenSalt)) {
      return false;
    }
    return areUint8ArraysEqual(this._bytes, o._bytes);
  }

  /**
   * @returns {Uint8Array} Copy of the salt bytes.
   */
  public toBytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  /**
   * Convert TokenSalt to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  /**
   * @returns {string} Hex representation of the salt.
   */
  public toString(): string {
    return `TokenSalt[${HexConverter.encode(this._bytes)}]`;
  }
}
