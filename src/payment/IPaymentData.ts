import { PaymentAssetCollection } from './asset/PaymentAssetCollection.js';

export interface IPaymentData {
  readonly assets: PaymentAssetCollection;

  toCBOR(): Promise<Uint8Array>;
}
