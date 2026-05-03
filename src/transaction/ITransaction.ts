import { DataHash } from '../crypto/hash/DataHash.js';
import { IPredicate } from '../predicate/IPredicate.js';

export interface ITransaction {
  readonly data: Uint8Array | null;

  readonly lockScript: IPredicate;

  readonly recipient: IPredicate;

  readonly sourceStateHash: DataHash;

  readonly stateMask: Uint8Array;

  calculateStateHash(): Promise<DataHash>;
  calculateTransactionHash(): Promise<DataHash>;

  toCBOR(): Uint8Array;
  toString(): string;
}
