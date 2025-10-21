import { IPredicateReference } from './IPredicateReference.js';
import { ISerializablePredicate } from './ISerializablePredicate.js';
import { RootTrustBase } from '../bft/RootTrustBase.js';
import { DataHash } from '../hash/DataHash.js';
import { Token } from '../token/Token.js';
import { IMintTransactionReason } from '../transaction/IMintTransactionReason.js';
import { TransferTransaction } from '../transaction/TransferTransaction.js';

/**
 * Interface for a predicate that controls token ownership.
 */
export interface IPredicate extends ISerializablePredicate {
  /**
   * Calculate predicate hash representation.
   *
   * @return predicate hash
   */
  calculateHash(): Promise<DataHash>;

  /**
   * Get predicate as reference.
   *
   * @return predicate reference
   */
  getReference(): Promise<IPredicateReference>;

  /**
   * Test if the given key is allowed to operate the token.
   * @param publicKey Public key to check ownership
   */
  isOwner(publicKey: Uint8Array): Promise<boolean>;

  /**
   * Verify if predicate is valid for given token state.
   *
   * @param trustBase   trust base to verify against.
   * @param token       current token state
   * @param transaction current transaction
   * @return true if successful
   */
  verify(
    trustBase: RootTrustBase,
    token: Token<IMintTransactionReason>,
    transaction: TransferTransaction,
  ): Promise<boolean>;
}
