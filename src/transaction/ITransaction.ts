import { DataHash } from '../crypto/hash/DataHash.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';

export interface ITransaction {
  readonly data: Uint8Array | null;

  readonly lockScript: EncodedPredicate;

  readonly recipient: EncodedPredicate;

  readonly sourceStateHash: DataHash;

  readonly stateMask: Uint8Array;

  calculateStateHash(): Promise<DataHash>;
  calculateTransactionHash(): Promise<DataHash>;

  toCBOR(): Uint8Array;
  toString(): string;
}
