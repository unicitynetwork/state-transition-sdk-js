import { PaymentAssetCollection } from '../../../src/payment/asset/PaymentAssetCollection.js';
import { IPaymentData } from '../../../src/payment/IPaymentData.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';

export class TestPaymentData implements IPaymentData {
  public constructor(public readonly assets: PaymentAssetCollection) {}

  public static decode(bytes: Uint8Array): Promise<TestPaymentData> {
    return Promise.resolve(new TestPaymentData(PaymentAssetCollection.fromCBOR(bytes)));
  }

  public encode(): Promise<Uint8Array> {
    return Promise.resolve(CborSerializer.encodeArray(...this.assets.toArray().map((asset) => asset.toCBOR())));
  }
}
