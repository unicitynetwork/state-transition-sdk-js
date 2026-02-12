import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

export class PayToScriptHash {
  private constructor(private readonly _bytes: Uint8Array) {
    this._bytes = new Uint8Array(_bytes);
  }

  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  public static async create(predicate: IPredicate): Promise<PayToScriptHash> {
    const hash = await new DataHasher(HashAlgorithm.SHA256).update(predicate.toCBOR()).digest();
    return new PayToScriptHash(hash.data);
  }

  public static fromBytes(bytes: Uint8Array): PayToScriptHash {
    const hash = new DataHash(HashAlgorithm.SHA256, bytes);
    return new PayToScriptHash(hash.data);
  }

  public static fromCBOR(bytes: Uint8Array): PayToScriptHash {
    return PayToScriptHash.fromBytes(CborDeserializer.decodeByteString(bytes));
  }

  public equals(hash: PayToScriptHash): boolean {
    return areUint8ArraysEqual(this._bytes, hash._bytes);
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  /**
   * Returns a string representation of the PayToScriptHash.
   * @returns The string representation.
   */
  public toString(): string {
    return `PayToScriptHash[${HexConverter.encode(this._bytes)}]`;
  }
}
