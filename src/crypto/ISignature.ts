// Convert signature to just bytes
export interface ISignature {
  readonly algorithm: string;
  readonly bytes: Uint8Array;

  toCBOR(): Uint8Array;
  toJSON(): string;
}
