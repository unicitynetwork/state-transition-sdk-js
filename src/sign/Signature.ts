import { ISignature } from './ISignature.js';
import { CborDecoder } from '../serializer/cbor/CborDecoder.js';
import { CborEncoder } from '../serializer/cbor/CborEncoder.js';
import { HexConverter } from '../util/HexConverter.js';

export class Signature implements ISignature {
  public readonly algorithm: string = 'secp256k1';

  public constructor(
    private readonly _bytes: Uint8Array,
    public readonly recovery: number,
  ) {
    this._bytes = new Uint8Array(_bytes);
  }

  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  public static fromCBOR(bytes: Uint8Array): Signature {
    return Signature.decode(CborDecoder.readByteString(bytes));
  }

  public static decode(bytes: Uint8Array): Signature {
    if (bytes.length !== 65) {
      throw new Error('Signature must contain signature and recovery byte.');
    }

    return new Signature(bytes.slice(0, -1), bytes[bytes.length - 1]);
  }

  public static fromJSON(data: string): Signature {
    return Signature.decode(HexConverter.decode(data));
  }

  public toJSON(): string {
    return HexConverter.encode(this.encode());
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeByteString(this.encode());
  }

  public encode(): Uint8Array {
    return new Uint8Array([...this._bytes, this.recovery]);
  }

  public toString(): string {
    return `${HexConverter.encode(this.encode())}`;
  }
}
