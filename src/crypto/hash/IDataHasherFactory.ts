import { HashAlgorithm } from './HashAlgorithm.js';
import { IDataHasher } from './IDataHasher.js';

/**
 * Factory that produces fresh {@link IDataHasher} instances for a fixed
 * {@link HashAlgorithm}.
 *
 * @typeParam T Concrete hasher type produced by this factory.
 */
export interface IDataHasherFactory<T extends IDataHasher> {
  /**
   * The hash algorithm used by the data hasher.
   */
  readonly algorithm: HashAlgorithm;

  /**
   * Create a new hasher instance.
   *
   * @returns {T} Fresh hasher instance.
   */
  create(): T;
}
