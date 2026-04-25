import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { CertifiedMintTransaction } from '../CertifiedMintTransaction.js';
import { MintTransaction } from '../MintTransaction.js';

export interface IMintJustificationVerifier {
  get tag(): bigint;

  verify(transaction: MintTransaction | CertifiedMintTransaction): Promise<VerificationResult<VerificationStatus>>;
}
