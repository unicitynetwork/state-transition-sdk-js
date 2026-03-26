import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

export class Address {
  private constructor(private readonly _bytes: Uint8Array) {
    if (_bytes.length !== 32) {
      throw new Error('Address must be 32 bytes long.');
    }

    this._bytes = new Uint8Array(_bytes);
  }

  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  public static fromBytes(bytes: Uint8Array): Address {
    const hash = new DataHash(HashAlgorithm.SHA256, bytes);
    return new Address(hash.data);
  }

  public static fromCBOR(bytes: Uint8Array): Address {
    return Address.fromBytes(CborDeserializer.decodeByteString(bytes));
  }

  public static async fromPredicate(predicate: IPredicate): Promise<Address> {
    const hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(EncodedPredicate.fromPredicate(predicate).toCBOR())
      .digest();
    return new Address(hash.data);
  }

  public equals(recipient: Address): boolean {
    return areUint8ArraysEqual(this._bytes, recipient.bytes);
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  /**
   * Returns a string representation of the PayToScriptHash.
   * @returns The string representation.
   */
  public toString(): string {
    return `Address[${HexConverter.encode(this._bytes)}]`;
  }
}
