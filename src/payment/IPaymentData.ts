import { PaymentAssetCollection } from './asset/PaymentAssetCollection.js';

export interface IPaymentData {
  readonly assets: PaymentAssetCollection;

  encode(): Promise<Uint8Array>;
}
