import { IPredicate } from './IPredicate.js';
import { ISerializablePredicate } from './ISerializablePredicate.js';

/**
 * Predicate engine structure.
 */
export interface IPredicateEngine {
  /**
   * Create predicate from serializable predicate.
   *
   * @param {ISerializablePredicate} predicate serializable predicate.
   * @return parsed predicate
   */
  create(predicate: ISerializablePredicate): Promise<IPredicate>;
}
