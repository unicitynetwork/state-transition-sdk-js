import { Asset } from './Asset.js';
import { AssetId } from './AssetId.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../util/HexConverter.js';

/**
 * Asset-id-keyed collection of {@link Asset} values used in a payment.
 */
export class PaymentAssetCollection {
  private constructor(private readonly _assets: Map<string, Asset>) {}

  /**
   * Create a PaymentAssetCollection.
   *
   * @param {...Asset} data Assets to include.
   * @returns {PaymentAssetCollection} New collection.
   * @throws {Error} If any asset id appears more than once.
   */
  public static create(...data: Asset[]): PaymentAssetCollection {
    const assets = new Map<string, Asset>();
    for (const asset of data) {
      const key = HexConverter.encode(asset.id.bytes);
      if (assets.has(key)) {
        throw new Error('Invalid payment asset collection. Duplicate assets found.');
      }
      assets.set(key, asset);
    }

    return new PaymentAssetCollection(assets);
  }

  /**
   * Create PaymentAssetCollection from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {PaymentAssetCollection} Decoded collection.
   */
  public static fromCBOR(bytes: Uint8Array): PaymentAssetCollection {
    const data = CborDeserializer.decodeArray(bytes);

    const assets: Asset[] = [];
    for (const asset of data) {
      assets.push(Asset.fromCBOR(asset));
    }

    return PaymentAssetCollection.create(...assets);
  }

  /**
   * Look up the asset with the given id.
   *
   * @param {AssetId} id Asset id.
   * @returns {Asset|null} Matching asset, or `null`.
   */
  public get(id: AssetId): Asset | null {
    return this._assets.get(HexConverter.encode(id.bytes)) ?? null;
  }

  /**
   * @returns {number} Number of assets in this collection.
   */
  public size(): number {
    return this._assets.size;
  }

  /**
   * @returns {Asset[]} Assets in insertion order.
   */
  public toArray(): Asset[] {
    return Array.from(this._assets.values());
  }

  /**
   * Convert PaymentAssetCollection to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(...this.toArray().map((asset) => asset.toCBOR()));
  }
}
