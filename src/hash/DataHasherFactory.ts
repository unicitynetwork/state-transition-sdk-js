import { HashAlgorithm } from './HashAlgorithm.js';
import { IDataHasher } from './IDataHasher.js';
import { IDataHasherFactory } from './IDataHasherFactory.js';

export class DataHasherFactory<T extends IDataHasher> implements IDataHasherFactory<T> {
  public constructor(
    public readonly algorithm: HashAlgorithm,
    private readonly _hasherConstructor: new (algorithm: HashAlgorithm) => T,
  ) {}

  public create(): T {
    return new this._hasherConstructor(this.algorithm);
  }
}
