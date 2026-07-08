import { AssetId } from './AssetId.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';

/**
 * Asset id paired with a strictly positive value in the range `[1, 2^256)`.
 */
export class Asset {
  public constructor(
    public readonly id: AssetId,
    private readonly _value: bigint,
  ) {
    if (_value <= 0n || _value >= 1n << 256n) {
      throw new Error('Asset value must be a positive 256-bit integer.');
    }
  }

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
    return new Asset(AssetId.fromCBOR(data[0]), CborDeserializer.decodeBigInteger(data[1], 32));
  }

  /**
   * Convert Asset to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.id.toCBOR(), CborSerializer.encodeBigInteger(this._value));
  }
}
