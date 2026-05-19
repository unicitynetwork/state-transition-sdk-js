import type { DataHash } from './hash/DataHash.js';
import { ISignature } from './ISignature.js';

/**
 * Service that can sign a {@link DataHash} and verify signatures of type `T`.
 *
 * @typeParam T Signature type produced and consumed by this service.
 */
export interface ISigningService<T extends ISignature> {
  readonly algorithm: string;
  readonly publicKey: Uint8Array;
  sign(hash: DataHash): Promise<T>;
  verify(hash: DataHash, signature: T): Promise<boolean>;
}
