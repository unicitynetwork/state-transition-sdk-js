import { PredicateEngine } from './PredicateEngine.js';

export interface IPredicate {
  get engine(): PredicateEngine;

  encodeCode(): Uint8Array;
  encodeParameters(): Uint8Array;

  toString(): string;
}
