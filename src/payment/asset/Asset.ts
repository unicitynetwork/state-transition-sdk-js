import { AssetId } from './AssetId.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';

/**
 * Asset id paired with a non-negative value.
 */
export class Asset {
  public constructor(
    public readonly id: AssetId,
    private readonly _value: bigint,
  ) {}

  /**
   * @returns {bigint} Value held by this asset.
   */
  public get value(): bigint {
    return this._value;
  }

  /**
   * Create Asset from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {Asset} Decoded asset.
   */
  public static fromCBOR(bytes: Uint8Array): Asset {
    const data = CborDeserializer.decodeArray(bytes, 2);

    return new Asset(AssetId.fromCBOR(data[0]), BigintConverter.decode(CborDeserializer.decodeByteString(data[1])));
  }

  /**
   * Convert Asset to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.id.toCBOR(),
      CborSerializer.encodeByteString(BigintConverter.encode(this._value)),
    );
  }
}
