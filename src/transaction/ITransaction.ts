import { StateMask } from './StateMask.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';

/**
 * Common shape for mint, transfer, and certified transactions. Captures the
 * source state, lock script, recipient predicate, and any data payload, and
 * exposes hashes used by verification rules and certification requests.
 */
export interface ITransaction {
  readonly data: Uint8Array | null;

  readonly lockScript: EncodedPredicate;

  readonly recipient: EncodedPredicate;

  readonly sourceStateHash: DataHash;

  readonly stateMask: StateMask;

  /**
   * Compute the hash of the resulting state after applying this transaction.
   *
   * @returns {Promise<DataHash>} Target state hash.
   */
  calculateStateHash(): Promise<DataHash>;

  /**
   * Compute the canonical hash of this transaction.
   *
   * @returns {Promise<DataHash>} Transaction hash.
   */
  calculateTransactionHash(): Promise<DataHash>;

  /**
   * Convert this transaction to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  toCBOR(): Uint8Array;

  toString(): string;
}
