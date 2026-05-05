import { CertifiedMintTransaction } from '../CertifiedMintTransaction.js';
import { MintJustificationVerifierService } from './MintJustificationVerifierService.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';

export interface IMintJustificationVerifier {
  get tag(): bigint;

  verify(
    transaction: CertifiedMintTransaction,
    mintJustificationVerifierService: MintJustificationVerifierService,
  ): Promise<VerificationResult<VerificationStatus>>;
}
