import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { BitString } from '../util/BitString.js';
import { HexConverter } from '../util/HexConverter.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

const textEncoder = new TextEncoder();

/**
 * Globally unique identifier of a token.
 */
export class TokenId {
  /**
   * @param _bytes Byte representation of the identifier
   */
  public constructor(private readonly _bytes: Uint8Array) {
    this._bytes = new Uint8Array(_bytes);
  }

  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  /**
   * Create token id from nametag.
   *
   * @param name nametag
   * @return token id
   */
  public static async fromNameTag(name: string): Promise<TokenId> {
    const hash = await new DataHasher(HashAlgorithm.SHA256).update(textEncoder.encode(name)).digest();
    return new TokenId(hash.imprint);
  }

  public static fromJSON(input: string): TokenId {
    return new TokenId(HexConverter.decode(input));
  }

  public static fromCBOR(bytes: Uint8Array): TokenId {
    return new TokenId(CborDeserializer.readByteString(bytes));
  }

  /** Encode as a hex string for JSON. */
  public toJSON(): string {
    return HexConverter.encode(this._bytes);
  }

  /** CBOR serialisation. */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  /** Convert instance to readable string */
  public toString(): string {
    return `TokenId[${HexConverter.encode(this._bytes)}]`;
  }

  /**
   * Converts the TokenId to a bitstring representation.
   */
  public toBitString(): BitString {
    return new BitString(this._bytes);
  }

  public equals(o: unknown): boolean {
    if (this === o) {
      return true;
    }

    if (!(o instanceof TokenId)) {
      return false;
    }

    return areUint8ArraysEqual(this._bytes, o._bytes);
  }
}
