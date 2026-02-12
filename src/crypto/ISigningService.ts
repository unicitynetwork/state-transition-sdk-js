import type { DataHash } from './hash/DataHash.js';
import { ISignature } from './ISignature.js';

export interface ISigningService<T extends ISignature> {
  readonly algorithm: string;
  readonly publicKey: Uint8Array;
  sign(hash: DataHash): Promise<T>;
  verify(hash: DataHash, signature: T): Promise<boolean>;
}
