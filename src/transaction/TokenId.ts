import { TokenSalt } from './TokenSalt.js';
import { NetworkId } from '../api/NetworkId.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { BitString } from '../util/BitString.js';
import { HexConverter } from '../util/HexConverter.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

/**
 * Globally unique identifier of a token.
 */
export class TokenId {
  public constructor(private readonly _bytes: Uint8Array) {
    this._bytes = new Uint8Array(_bytes);
  }

  /**
   * @returns {Uint8Array} Copy of the identifier bytes.
   */
  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  /**
   * Create TokenId from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {TokenId} Decoded token id.
   */
  public static fromCBOR(bytes: Uint8Array): TokenId {
    return new TokenId(CborDeserializer.decodeByteString(bytes));
  }

  /**
   * Derive a TokenId from a salt and network identifier.
   *
   * @param {NetworkId} networkId Network identifier.
   * @param {TokenSalt} salt Mint-transaction salt.
   * @returns {Promise<TokenId>} Derived token id.
   */
  public static async fromSalt(networkId: NetworkId, salt: TokenSalt): Promise<TokenId> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeArray(salt.toCBOR(), CborSerializer.encodeUnsignedInteger(networkId.id)))
      .digest();
    return new TokenId(hash.data);
  }

  /**
   * Equality check against another value.
   *
   * @param {unknown} o Other value.
   * @returns {boolean} True if `o` is a TokenId with the same bytes.
   */
  public equals(o: unknown): boolean {
    if (this === o) {
      return true;
    }

    if (!(o instanceof TokenId)) {
      return false;
    }

    return areUint8ArraysEqual(this._bytes, o._bytes);
  }

  /**
   * Convert the TokenId to a bit-string representation.
   *
   * @returns {BitString} Bit-string view of the identifier bytes.
   */
  public toBitString(): BitString {
    return BitString.fromBytes(this._bytes);
  }

  /**
   * Convert TokenId to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  /**
   * @returns {string} Human-readable representation of the token id.
   */
  public toString(): string {
    return `TokenId[${HexConverter.encode(this._bytes)}]`;
  }
}
