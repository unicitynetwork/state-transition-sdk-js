import { Asset } from './Asset.js';
import { AssetId } from './AssetId.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';

export class PaymentAssetCollection {
  private constructor(private readonly _assets: Map<string, Asset>) {}

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

  // TODO: decode and encode?
  public static fromCBOR(bytes: Uint8Array): PaymentAssetCollection {
    const data = CborDeserializer.decodeArray(bytes);

    const assets: Asset[] = [];
    for (const asset of data) {
      assets.push(Asset.fromCBOR(asset));
    }

    return PaymentAssetCollection.create(...assets);
  }

  public get(id: AssetId): Asset | null {
    return this._assets.get(HexConverter.encode(id.bytes)) ?? null;
  }

  public size(): number {
    return this._assets.size;
  }

  public toArray(): Asset[] {
    return Array.from(this._assets.values());
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(...this.toArray().map((asset) => asset.toCBOR()));
  }
}
