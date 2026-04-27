import { AssetId } from './AssetId.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';

export class Asset {
  public constructor(
    public readonly id: AssetId,
    private readonly _value: bigint,
  ) {}

  public get value(): bigint {
    return this._value;
  }

  public static fromCBOR(bytes: Uint8Array): Asset {
    const data = CborDeserializer.decodeArray(bytes);

    return new Asset(AssetId.fromCBOR(data[0]), BigintConverter.decode(CborDeserializer.decodeByteString(data[1])));
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.id.toCBOR(),
      CborSerializer.encodeByteString(BigintConverter.encode(this._value)),
    );
  }
}
