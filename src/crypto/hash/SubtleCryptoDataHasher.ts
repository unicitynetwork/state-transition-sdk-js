import { DataHash } from './DataHash.js';
import { HashAlgorithm } from './HashAlgorithm.js';
import { IDataHasher } from './IDataHasher.js';
import { UnsupportedHashAlgorithmError } from './UnsupportedHashAlgorithmError.js';

export const Algorithm = {
  [HashAlgorithm.RIPEMD160.id]: null,
  [HashAlgorithm.SHA224.id]: null,
  [HashAlgorithm.SHA256.id]: 'SHA-256',
  [HashAlgorithm.SHA384.id]: 'SHA-384',
  [HashAlgorithm.SHA512.id]: 'SHA-512',
};

/**
 * Does hashing with asynchronous way
 */
export class SubtleCryptoDataHasher implements IDataHasher {
  private _data: Uint8Array<ArrayBuffer>;

  public constructor(public readonly algorithm: HashAlgorithm) {
    if (!Algorithm[algorithm.id]) {
      throw new UnsupportedHashAlgorithmError(algorithm);
    }

    this._data = new Uint8Array(0);
  }

  /**
   * @inheritDoc
   */
  public async digest(): Promise<DataHash> {
    return new DataHash(
      this.algorithm,
      new Uint8Array(await window.crypto.subtle.digest({ name: Algorithm[this.algorithm.id] as string }, this._data)),
    );
  }

  /**
   * @inheritDoc
   */
  public update(data: Uint8Array): this {
    const previousData = this._data;
    this._data = new Uint8Array(previousData.length + data.length);
    this._data.set(previousData);
    this._data.set(data, previousData.length);

    return this;
  }
}
