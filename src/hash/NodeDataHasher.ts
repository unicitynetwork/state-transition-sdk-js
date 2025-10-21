import { createHash, Hash } from 'crypto';

import { DataHash } from './DataHash.js';
import { HashAlgorithm } from './HashAlgorithm.js';
import { IDataHasher } from './IDataHasher.js';

export const Algorithm = {
  [HashAlgorithm.RIPEMD160]: 'RIPEMD160',
  [HashAlgorithm.SHA224]: 'SHA224',
  [HashAlgorithm.SHA256]: 'SHA256',
  [HashAlgorithm.SHA384]: 'SHA384',
  [HashAlgorithm.SHA512]: 'SHA512',
};

export class NodeDataHasher implements IDataHasher {
  private _hasher: Hash;

  /**
   * Create Node Hasher
   * @param {string} algorithm
   */
  public constructor(public readonly algorithm: HashAlgorithm) {
    this._hasher = createHash(Algorithm[this.algorithm]);
  }

  /**
   * Digest the final result
   * @return {Promise<Uint8Array>}
   */
  public digest(): Promise<DataHash> {
    return Promise.resolve(new DataHash(this.algorithm, this._hasher.digest()));
  }

  /**
   * Update the hasher content
   * @param {Uint8Array} data byte array
   * @return {IDataHasher}
   */
  public update(data: Uint8Array): this {
    this._hasher.update(data);

    return this;
  }
}
