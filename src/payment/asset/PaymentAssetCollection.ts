import { Asset } from './Asset.js';
import { AssetId } from './AssetId.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborError } from '../../serialization/cbor/CborError.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../util/HexConverter.js';

/**
 * Asset-id-keyed collection of {@link Asset} values used in a payment. Assets are
 * held in canonical asset-id order — the order the split protocol requires — so
 * {@link toArray} and {@link toCBOR} always produce that order.
 */
export class PaymentAssetCollection {
  private constructor(private readonly _assets: Map<string, Asset>) {}

  /**
   * Create a PaymentAssetCollection. Assets may be supplied in any order; they
   * are stored canonically.
   *
   * @param {...Asset} data Assets to include (1..256, distinct ids).
   * @returns {PaymentAssetCollection} New collection.
   * @throws {Error} If the count is out of range, or an asset id repeats.
   */
  public static create(...data: Asset[]): PaymentAssetCollection {
    return PaymentAssetCollection.fromArray(data.sort(PaymentAssetCollection.compareAssets));
  }

  /**
   * Create PaymentAssetCollection from CBOR bytes. The encoded assets MUST be in
   * strict canonical asset-id order with no duplicates.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {PaymentAssetCollection} Decoded collection.
   * @throws {CborError} If the assets are not in strict canonical asset-id order.
   */
  public static fromCBOR(bytes: Uint8Array): PaymentAssetCollection {
    const assets = CborDeserializer.decodeArray(bytes).map((asset) => Asset.fromCBOR(asset));
    for (let i = 1; i < assets.length; i++) {
      if (PaymentAssetCollection.compareAssets(assets[i - 1], assets[i]) >= 0) {
        throw new CborError('Payment assets must be in strict canonical asset-id order.');
      }
    }

    return PaymentAssetCollection.fromArray(assets);
  }

  /**
   * Compare two assets by their asset id in canonical order: ascending unsigned
   * lexicographic order of the raw id bytes, a shorter id ordered before a longer
   * one that it is a prefix of.
   *
   * @param {Asset} a First asset.
   * @param {Asset} b Second asset.
   * @returns {number} Negative if `a < b`, positive if `a > b`, zero if equal.
   */
  private static compareAssets(a: Asset, b: Asset): number {
    const x = a.id.bytes;
    const y = b.id.bytes;
    const length = Math.min(x.length, y.length);
    for (let i = 0; i < length; i++) {
      if (x[i] !== y[i]) {
        return x[i] - y[i];
      }
    }

    return x.length - y.length;
  }

  /**
   * Build a collection from assets already in canonical asset-id order, validating
   * the count and rejecting duplicates without re-sorting.
   *
   * @param {Asset[]} assets Assets in canonical asset-id order.
   * @returns {PaymentAssetCollection} New collection.
   * @throws {Error} If the count is out of range, or an asset id repeats.
   */
  private static fromArray(assets: Asset[]): PaymentAssetCollection {
    if (assets.length < 1 || assets.length > 256) {
      throw new Error(`Payment asset collection must hold between 1 and 256 assets, got ${assets.length}.`);
    }

    const map = new Map<string, Asset>();
    for (const asset of assets) {
      const key = HexConverter.encode(asset.id.bytes);
      if (map.has(key)) {
        throw new Error('Invalid payment asset collection. Duplicate assets found.');
      }
      map.set(key, asset);
    }

    return new PaymentAssetCollection(map);
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
   * @returns {Asset[]} Assets in canonical asset-id order.
   */
  public toArray(): Asset[] {
    return Array.from(this._assets.values());
  }

  /**
   * Convert PaymentAssetCollection to CBOR bytes (assets in canonical order).
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(...this.toArray().map((asset) => asset.toCBOR()));
  }
}
