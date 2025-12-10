import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

export class InvalidRecipientError extends Error {
  public constructor() {
    super('Invalid Recipient.');
  }
}

export class PayToScriptHash extends DataHash {
  private constructor(public readonly hash: DataHash) {
    super(hash.algorithm, hash.data);
  }

  public static async create(predicate: IPredicate): Promise<PayToScriptHash> {
    const hash = await new DataHasher(HashAlgorithm.SHA256).update(predicate.encode()).digest();
    return new PayToScriptHash(hash);
  }
}

export class Recipient {
  private constructor(
    private readonly type: number,
    private readonly _predicate: Uint8Array,
    private readonly _checksum: Uint8Array,
  ) {
    this._predicate = new Uint8Array(_predicate);
  }

  // public static async create(predicate: IPredicate): Promise<Recipient> {
  //   const hash = await new DataHasher(HashAlgorithm.SHA256).update(predicate.toCBOR()).digest();
  //   return new Recipient(predicate.type, predicate.toCBOR(), hash.data.slice(-4));
  // }

  public static async decode(data: Uint8Array): Promise<Recipient> {
    const type = data[0];
    const predicate = data.slice(1, data.length - 4);
    const checksum = data.slice(-4);

    const hash = await new DataHasher(HashAlgorithm.SHA256).update(predicate).digest();
    if (!areUint8ArraysEqual(hash.data.slice(-4), checksum)) {
      throw new InvalidRecipientError();
    }

    return new Recipient(type, predicate, checksum);
  }

  public static fromString(data: string): Promise<Recipient> {
    if (!data.startsWith('alpha1')) {
      throw new InvalidRecipientError();
    }

    return Recipient.decode(HexConverter.decode(data.substring(6)));
  }

  public encode(): Uint8Array {
    return new Uint8Array([this.type, ...this._predicate, ...this._checksum]);
  }

  public toString(): string {
    return `alpha1${HexConverter.encode(this.encode())}`;
  }
}
