import { PredicateEngine } from './PredicateEngine.js';

/**
 * Spending condition attached to a token state. Predicates split into a
 * `code` part  and a `parameters` part .
 */
export interface IPredicate {
  /**
   * Predicate engine that owns this predicate's verifier.
   */
  get engine(): PredicateEngine;

  /**
   * @returns Canonical encoding of the predicate code.
   */
  encodeCode(): Uint8Array;

  /**
   * @returns Canonical encoding of the predicate parameters.
   */
  encodeParameters(): Uint8Array;

  toString(): string;
}
