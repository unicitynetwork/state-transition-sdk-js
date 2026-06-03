import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha224, sha256, sha384, sha512 } from '@noble/hashes/sha2.js';

import { DataHash } from './DataHash.js';
import { HashAlgorithm } from './HashAlgorithm.js';
import { IDataHasher } from './IDataHasher.js';
import { UnsupportedHashAlgorithmError } from './UnsupportedHashAlgorithmError.js';

/**
 * Internal streaming digest interface implemented by the noble hashers.
 */
interface IMessageDigest {
  destroy(): void;

  digest(): Uint8Array;

  update(buf: Uint8Array): this;
}

export const Algorithm = {
  [HashAlgorithm.RIPEMD160.id]: ripemd160,
  [HashAlgorithm.SHA224.id]: sha224,
  [HashAlgorithm.SHA256.id]: sha256,
  [HashAlgorithm.SHA384.id]: sha384,
  [HashAlgorithm.SHA512.id]: sha512,
};

/**
 * Provides synchronous hashing functions
 */
export class DataHasher implements IDataHasher {
  private _messageDigest: IMessageDigest;

  public constructor(public readonly algorithm: HashAlgorithm) {
    if (!Algorithm[algorithm.id]) {
      throw new UnsupportedHashAlgorithmError(algorithm);
    }

    this._messageDigest = Algorithm[algorithm.id].create();
  }

  /**
   * @inheritDoc
   */
  public digest(): Promise<DataHash> {
    return Promise.resolve(new DataHash(this.algorithm, this._messageDigest.digest()));
  }

  /**
   * @inheritDoc
   */
  public update(data: Uint8Array): this {
    this._messageDigest.update(data);
    return this;
  }
}
