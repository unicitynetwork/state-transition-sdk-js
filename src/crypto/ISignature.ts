/**
 * Cryptographic signature with a named algorithm and a serializable byte form
 * (CBOR and JSON).
 */
export interface ISignature {
  readonly algorithm: string;
  readonly bytes: Uint8Array;

  toCBOR(): Uint8Array;
  toJSON(): string;
}
