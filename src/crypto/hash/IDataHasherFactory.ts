import { HashAlgorithm } from './HashAlgorithm.js';
import { IDataHasher } from './IDataHasher.js';

export interface IDataHasherFactory<T extends IDataHasher> {
  /**
   * The hash algorithm used by the data hasher.
   */
  readonly algorithm: HashAlgorithm;

  /**
   * Creates a new instance of the data hasher.
   * @returns IDataHasher instance.
   */
  create(): T;
}
