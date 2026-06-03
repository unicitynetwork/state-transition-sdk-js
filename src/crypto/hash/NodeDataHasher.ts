import { createHash, Hash } from 'crypto';

import { DataHash } from './DataHash.js';
import { HashAlgorithm } from './HashAlgorithm.js';
import { IDataHasher } from './IDataHasher.js';

export const Algorithm = {
  [HashAlgorithm.RIPEMD160.id]: 'RIPEMD160',
  [HashAlgorithm.SHA224.id]: 'SHA224',
  [HashAlgorithm.SHA256.id]: 'SHA256',
  [HashAlgorithm.SHA384.id]: 'SHA384',
  [HashAlgorithm.SHA512.id]: 'SHA512',
};

/**
 * {@link IDataHasher} implementation backed by Node's built-in `crypto` module.
 * Suitable for server-side code; use {@link SubtleCryptoDataHasher} in the
 * browser.
 */
export class NodeDataHasher implements IDataHasher {
  private _hasher: Hash;

  public constructor(public readonly algorithm: HashAlgorithm) {
    this._hasher = createHash(Algorithm[this.algorithm.id]);
  }

  /**
   * @inheritDoc
   */
  public digest(): Promise<DataHash> {
    return Promise.resolve(new DataHash(this.algorithm, this._hasher.digest()));
  }

  /**
   * @inheritDoc
   */
  public update(data: Uint8Array): this {
    this._hasher.update(data);

    return this;
  }
}
