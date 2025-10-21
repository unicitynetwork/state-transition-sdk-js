import { DataHash } from './DataHash.js';
import { HashAlgorithm } from './HashAlgorithm.js';

export interface IDataHasher {
  readonly algorithm: HashAlgorithm;

  update(data: Uint8Array): this;
  digest(): Promise<DataHash>;
}
