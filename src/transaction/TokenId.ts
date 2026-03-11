import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { UnicityId } from '../unicity-id/UnicityId.js';
import { BitString } from '../util/BitString.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

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

  public static fromCBOR(bytes: Uint8Array): TokenId {
    return new TokenId(CborDeserializer.decodeByteString(bytes));
  }

  public static async fromUnicityId(unicityId: UnicityId): Promise<TokenId> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeTextString('NAMETAG_'),
          CborSerializer.encodeNullable(unicityId.domain, CborSerializer.encodeTextString),
          CborSerializer.encodeTextString(unicityId.name),
        ),
      )
      .digest();

    return new TokenId(hash.data);
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

  /**
   * Converts the TokenId to a bitstring representation.
   */
  public toBitString(): BitString {
    return new BitString(this._bytes);
  }

  /** CBOR serialisation. */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  /** Convert instance to readable string */
  public toString(): string {
    return `TokenId[${HexConverter.encode(this._bytes)}]`;
  }
}
