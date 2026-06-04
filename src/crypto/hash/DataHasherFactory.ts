import { HashAlgorithm } from './HashAlgorithm.js';
import { IDataHasher } from './IDataHasher.js';
import { IDataHasherFactory } from './IDataHasherFactory.js';

/**
 * Generic factory that produces fresh {@link IDataHasher} instances of type
 * `T` for a fixed {@link HashAlgorithm}. Lets callers choose the hasher
 * implementation (Node, Web Crypto, noble) without coupling to it.
 *
 * @typeParam T Concrete hasher type produced by this factory.
 */
export class DataHasherFactory<T extends IDataHasher> implements IDataHasherFactory<T> {
  public constructor(
    public readonly algorithm: HashAlgorithm,
    private readonly _hasherConstructor: new (algorithm: HashAlgorithm) => T,
  ) {}

  /**
   * Create a new hasher instance configured with {@link algorithm}.
   *
   * @returns {T} Fresh hasher instance.
   */
  public create(): T {
    return new this._hasherConstructor(this.algorithm);
  }
}
