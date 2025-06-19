import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

/** Unique identifier describing the type/category of a token. */
export class TokenType {
  /**
   * @param _bytes Byte representation of the token type
   */
  public constructor(private readonly _bytes: Uint8Array) {
    this._bytes = new Uint8Array(_bytes);
  }

  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  /** Create an instance from raw bytes. */
  public static create(id: Uint8Array): TokenType {
    return new TokenType(id);
  }

  /** Hex representation for JSON serialization. */
  public toJSON(): string {
    return HexConverter.encode(this._bytes);
  }

  /** CBOR serialization. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeByteString(this._bytes);
  }

  /** Convert instance to readable string */
  public toString(): string {
    return `TokenType[${HexConverter.encode(this._bytes)}]`;
  }
}
