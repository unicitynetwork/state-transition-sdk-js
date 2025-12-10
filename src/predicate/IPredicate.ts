export interface IPredicate {
  get type(): bigint;

  encode(): Uint8Array;

  toString(): string;
}
