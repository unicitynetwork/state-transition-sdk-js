import { PaymentAssetCollection } from './asset/PaymentAssetCollection.js';

/**
 * Payment payload carried by a transfer: a collection of assets plus their
 * canonical encoding used in payment proofs.
 */
export interface IPaymentData {
  readonly assets: PaymentAssetCollection;

  /**
   * @returns {Promise<Uint8Array>} Canonical encoded form of this payment data.
   */
  encode(): Promise<Uint8Array>;
}
