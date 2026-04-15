import { Address } from './Address.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { IPredicate } from '../predicate/IPredicate.js';

export interface ITransaction {
  readonly data: Uint8Array;

  readonly lockScript: IPredicate;

  readonly recipient: Address;

  readonly sourceStateHash: DataHash;

  readonly x: Uint8Array;

  calculateStateHash(): Promise<DataHash>;
  calculateTransactionHash(): Promise<DataHash>;

  toCBOR(): Uint8Array;
  toString(): string;
}
