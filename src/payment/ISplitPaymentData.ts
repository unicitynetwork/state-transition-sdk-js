import { IPaymentData } from './IPaymentData.js';
import { SplitReason } from './SplitReason.js';

export interface ISplitPaymentData extends IPaymentData {
  readonly reason: SplitReason;
}
