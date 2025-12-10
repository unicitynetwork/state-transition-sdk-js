import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';

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

  public static fromCBOR(bytes: Uint8Array): TokenType {
    return new TokenType(CborDeserializer.decodeByteString(bytes));
  }

  public static fromJSON(input: string): TokenType {
    return new TokenType(HexConverter.decode(input));
  }

  /** CBOR serialization. */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  /** Hex representation for JSON serialization. */
  public toJSON(): string {
    return HexConverter.encode(this._bytes);
  }

  /** Convert instance to readable string */
  public toString(): string {
    return `TokenType[${HexConverter.encode(this._bytes)}]`;
  }
}
