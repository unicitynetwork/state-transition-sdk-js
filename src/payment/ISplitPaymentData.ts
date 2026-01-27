import { IPaymentData } from './IPaymentData.js';
import { ISplitReason } from './ISplitReason.js';

export interface ISplitPaymentData extends IPaymentData {
  readonly reason: ISplitReason;
}
