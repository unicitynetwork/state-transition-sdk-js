import { PaymentAssetCollection } from './asset/PaymentAssetCollection.js';
import { IReason } from './IReason.js';

export interface IPaymentData {
  readonly assets: PaymentAssetCollection;
  readonly reason: IReason;

  toCBOR(): Uint8Array;
}
