import { IPredicate } from '../IPredicate.js';
import { BuiltInPredicateType } from './BuiltInPredicateType.js';

/**
 * Predicate executed by the built-in engine, distinguished by its
 * {@link BuiltInPredicateType}.
 */
export interface IBuiltInPredicate extends IPredicate {
  /**
   * Built-in predicate type id.
   */
  get type(): BuiltInPredicateType;
}
