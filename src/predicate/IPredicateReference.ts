import { IAddress } from '../address/IAddress.js';
import { DataHash } from '../hash/DataHash.js';

/**
 * Predicate reference interface.
 */
export interface IPredicateReference {
  /**
   * Get predicate reference hash.
   *
   * @return reference hash
   */
  readonly hash: DataHash;

  /**
   * Get predicate reference as address.
   *
   * @return reference address
   */
  toAddress(): Promise<IAddress>;
}
