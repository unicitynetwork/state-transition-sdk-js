import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha224, sha256, sha384, sha512 } from '@noble/hashes/sha2.js';

import { DataHash } from './DataHash.js';
import { HashAlgorithm } from './HashAlgorithm.js';
import { IDataHasher } from './IDataHasher.js';
import { UnsupportedHashAlgorithmError } from './UnsupportedHashAlgorithmError.js';

interface IMessageDigest {
  update(buf: Uint8Array): this;

  digest(): Uint8Array;

  destroy(): void;
}

export const Algorithm = {
  [HashAlgorithm.RIPEMD160]: ripemd160,
  [HashAlgorithm.SHA224]: sha224,
  [HashAlgorithm.SHA256]: sha256,
  [HashAlgorithm.SHA384]: sha384,
  [HashAlgorithm.SHA512]: sha512,
};

/**
 * Provides synchronous hashing functions
 */
export class DataHasher implements IDataHasher {
  private _messageDigest: IMessageDigest;

  /**
   * Create DataHasher instance the hash algorithm
   * @param {HashAlgorithm} algorithm
   */
  public constructor(public readonly algorithm: HashAlgorithm) {
    if (!Algorithm[algorithm]) {
      throw new UnsupportedHashAlgorithmError(algorithm);
    }

    this._messageDigest = Algorithm[algorithm].create();
  }

  /**
   * Add data for hashing
   * @param {Uint8Array} data byte array
   * @returns {DataHasher}
   */
  public update(data: Uint8Array): this {
    this._messageDigest.update(data);
    return this;
  }

  /**
   * Hashes the data and returns the DataHash
   * @returns DataHash
   */
  public digest(): Promise<DataHash> {
    return Promise.resolve(new DataHash(this.algorithm, this._messageDigest.digest()));
  }
}
