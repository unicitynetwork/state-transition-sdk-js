import { DataHash } from './DataHash.js';
import { HashAlgorithm } from './HashAlgorithm.js';

/**
 * Streaming hasher: feed bytes with {@link IDataHasher.update} and obtain the
 * final {@link DataHash} with {@link IDataHasher.digest}.
 */
export interface IDataHasher {
  readonly algorithm: HashAlgorithm;

  /**
   * Compute the final hash of all data fed so far.
   *
   * @returns {Promise<DataHash>} Final hash.
   */
  digest(): Promise<DataHash>;

  /**
   * Feed more bytes into the hasher.
   *
   * @param {Uint8Array} data Bytes to add.
   * @returns {this} This hasher for chaining.
   */
  update(data: Uint8Array): this;
}
