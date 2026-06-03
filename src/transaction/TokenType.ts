import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';

/** Unique identifier describing the type/category of a token. */
export class TokenType {
  public constructor(private readonly _bytes: Uint8Array) {
    this._bytes = new Uint8Array(_bytes);
  }

  /**
   * @returns {Uint8Array} Copy of the token type bytes.
   */
  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  /**
   * Create TokenType from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {TokenType} Decoded token type.
   */
  public static fromCBOR(bytes: Uint8Array): TokenType {
    return new TokenType(CborDeserializer.decodeByteString(bytes));
  }

  /**
   * Generate a fresh random TokenType.
   *
   * @returns {TokenType} New token type with random 32-byte payload.
   */
  public static generate(): TokenType {
    return new TokenType(crypto.getRandomValues(new Uint8Array(32)));
  }

  /**
   * Convert TokenType to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  /**
   * @returns {string} Human-readable representation of the token type.
   */
  public toString(): string {
    return `TokenType[${HexConverter.encode(this._bytes)}]`;
  }
}
