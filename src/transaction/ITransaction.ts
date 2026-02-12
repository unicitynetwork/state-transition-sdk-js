import { PayToScriptHash } from './PayToScriptHash.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { IPredicate } from '../predicate/IPredicate.js';

export interface ITransaction {
  readonly data: Uint8Array;

  readonly lockScript: IPredicate;

  readonly recipient: PayToScriptHash;

  readonly sourceStateHash: DataHash;

  readonly x: Uint8Array;

  calculateStateHash(): Promise<DataHash>;
  calculateTransactionHash(): Promise<DataHash>;
}
