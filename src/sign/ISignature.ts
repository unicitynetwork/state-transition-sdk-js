export interface ISignature {
  readonly algorithm: string;
  readonly bytes: Uint8Array;

  toJSON(): string;
  toCBOR(): Uint8Array;
}
