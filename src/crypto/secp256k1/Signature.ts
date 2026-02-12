import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { ISignature } from '../ISignature.js';

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

  public static decode(bytes: Uint8Array): Signature {
    if (bytes.length !== 65) {
      throw new Error('Signature must contain signature and recovery byte.');
    }

    return new Signature(bytes.slice(0, -1), bytes[bytes.length - 1]);
  }

  public static fromCBOR(bytes: Uint8Array): Signature {
    return Signature.decode(CborDeserializer.decodeByteString(bytes));
  }

  public static fromJSON(data: string): Signature {
    return Signature.decode(HexConverter.decode(data));
  }

  public encode(): Uint8Array {
    return new Uint8Array([...this._bytes, this.recovery]);
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this.encode());
  }

  public toJSON(): string {
    return HexConverter.encode(this.encode());
  }

  public toString(): string {
    return `${HexConverter.encode(this.encode())}`;
  }
}
