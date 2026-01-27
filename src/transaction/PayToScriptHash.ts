import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

export class PayToScriptHash {
  private constructor(
    private readonly hash: DataHash,
    private readonly _checksum: Uint8Array,
  ) {
    this._checksum = new Uint8Array(_checksum);
  }

  public static async create(predicate: IPredicate): Promise<PayToScriptHash> {
    const hash = await new DataHasher(HashAlgorithm.SHA256).update(predicate.toCBOR()).digest();
    return PayToScriptHash.createFromHash(hash);
  }

  public static fromCBOR(bytes: Uint8Array): Promise<PayToScriptHash> {
    return PayToScriptHash.fromString(CborDeserializer.decodeTextString(bytes));
  }

  public static async fromString(data: string): Promise<PayToScriptHash> {
    if (!data.startsWith('alpha1')) {
      throw new Error('Invalid PayToScriptHash string format.');
    }

    const hash = HexConverter.decode(data.slice(6, -8));
    const checksum = HexConverter.decode(data.slice(-8));

    const calculatedChecksum = await new DataHasher(HashAlgorithm.SHA256)
      .update(hash)
      .digest()
      .then((d) => d.imprint.slice(-4));

    if (!areUint8ArraysEqual(checksum, calculatedChecksum)) {
      throw new Error('Invalid PayToScriptHash checksum.');
    }

    return new PayToScriptHash(DataHash.fromImprint(hash), checksum);
  }

  private static async createFromHash(hash: DataHash): Promise<PayToScriptHash> {
    return new PayToScriptHash(
      hash,
      // TODO: Replace with CRC32 checksum
      await new DataHasher(HashAlgorithm.SHA256)
        .update(hash.imprint)
        .digest()
        .then((d) => d.imprint.slice(-4)),
    );
  }

  public equals(hash: PayToScriptHash): boolean {
    return this.toString() === hash.toString();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTextString(this.toString());
  }

  public toString(): string {
    return `alpha1${HexConverter.encode(this.hash.imprint)}${HexConverter.encode(this._checksum)}`;
  }
}
