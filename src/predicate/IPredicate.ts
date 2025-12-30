import { PredicateEngine } from './PredicateEngine.js';

export interface IPredicate {
  get engine(): PredicateEngine;

  encode(): Uint8Array;

  toString(): string;
}
