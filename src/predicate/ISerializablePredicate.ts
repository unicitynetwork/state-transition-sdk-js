import { PredicateEngineType } from './PredicateEngineType.js';

export interface ISerializablePredicate {
  readonly engine: PredicateEngineType;
  encode(): Uint8Array;
  encodeParameters(): Uint8Array;

  toString(): string;
}
