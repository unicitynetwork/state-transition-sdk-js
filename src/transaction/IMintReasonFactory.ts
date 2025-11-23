import { IMintTransactionReason } from './IMintTransactionReason.js';

export interface IMintReasonFactory {
  create(bytes: Uint8Array): Promise<IMintTransactionReason>;
}
