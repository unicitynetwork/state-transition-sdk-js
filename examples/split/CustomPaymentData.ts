import { PaymentAssetCollection } from '../../src/payment/asset/PaymentAssetCollection.js';
import { IPaymentData } from '../../src/payment/IPaymentData.js';
import { CborDeserializer } from '../../src/serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../src/serialization/cbor/CborSerializer.js';

export class CustomPaymentData implements IPaymentData {
  public constructor(
    public readonly assets: PaymentAssetCollection,
    public readonly otherData: string,
  ) {}

  public static fromCBOR(bytes: Uint8Array): Promise<CustomPaymentData> {
    const data = CborDeserializer.decodeArray(bytes);
    return Promise.resolve(
      new CustomPaymentData(PaymentAssetCollection.fromCBOR(data[0]), CborDeserializer.decodeTextString(data[1])),
    );
  }

  public toCBOR(): Promise<Uint8Array> {
    return Promise.resolve(
      CborSerializer.encodeArray(this.assets.toCBOR(), CborSerializer.encodeTextString(this.otherData)),
    );
  }
}
