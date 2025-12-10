import { DataHash } from './DataHash.js';
import { HashAlgorithm } from './HashAlgorithm.js';

export interface IDataHasher {
  readonly algorithm: HashAlgorithm;

  digest(): Promise<DataHash>;
  update(data: Uint8Array): this;
}
