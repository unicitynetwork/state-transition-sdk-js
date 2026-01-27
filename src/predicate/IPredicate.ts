import { PredicateEngine } from './PredicateEngine.js';

export interface IPredicate {
  get engine(): PredicateEngine;

  toCBOR(): Uint8Array;

  toString(): string;
}
