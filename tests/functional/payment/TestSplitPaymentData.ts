import { PaymentAssetCollection } from '../../../src/payment/asset/PaymentAssetCollection.js';
import { ISplitPaymentData } from '../../../src/payment/ISplitPaymentData.js';
import { SplitReason } from '../../../src/payment/SplitReason.js';
import { CborDeserializer } from '../../../src/serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';

export class TestSplitPaymentData implements ISplitPaymentData {
  public constructor(
    public readonly assets: PaymentAssetCollection,
    public readonly reason: SplitReason,
  ) {}

  public static async decode(bytes: Uint8Array): Promise<TestSplitPaymentData> {
    const data = CborDeserializer.decodeArray(bytes);

    return Promise.resolve(
      new TestSplitPaymentData(PaymentAssetCollection.fromCBOR(data[0]), await SplitReason.fromCBOR(data[1])),
    );
  }

  public encode(): Promise<Uint8Array> {
    return Promise.resolve(CborSerializer.encodeArray(this.assets.toCBOR(), this.reason.toCBOR()));
  }
}
