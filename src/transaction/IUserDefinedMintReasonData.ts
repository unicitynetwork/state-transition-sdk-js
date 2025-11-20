import { MintTransaction } from './MintTransaction.js';
import { VerificationResult } from '../verification/VerificationResult.js';

export interface IUserDefinedMintReasonData {
  verify(transaction: MintTransaction): Promise<VerificationResult>;
  toBytes(): Uint8Array;
}
