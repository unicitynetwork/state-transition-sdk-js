import { ISignature } from './ISignature.js';
import type { DataHash } from '../hash/DataHash.js';

export interface ISigningService<T extends ISignature> {
  readonly publicKey: Uint8Array;
  readonly algorithm: string;
  sign(hash: DataHash): Promise<T>;
  verify(hash: DataHash, signature: T): Promise<boolean>;
}
