import { IPredicate } from '../IPredicate.js';
import { BuiltInPredicateType } from './BuiltInPredicateType.js';

export interface IBuiltInPredicate extends IPredicate {
  get type(): BuiltInPredicateType;
}
