import { CertifiedMintTransaction } from '../CertifiedMintTransaction.js';
import { MintJustificationVerifierService } from './MintJustificationVerifierService.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';

/**
 * Verifier for a single mint justification CBOR tag. Plugged into
 * {@link MintJustificationVerifierService} which dispatches by tag.
 */
export interface IMintJustificationVerifier {
  /**
   * CBOR tag this verifier handles.
   */
  get tag(): bigint;

  /**
   * Verify the justification embedded in `transaction`.
   *
   * @param {CertifiedMintTransaction} transaction Transaction whose justification to verify.
   * @param {MintJustificationVerifierService} mintJustificationVerifierService Service available for recursive verification.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  verify(
    transaction: CertifiedMintTransaction,
    mintJustificationVerifierService: MintJustificationVerifierService,
  ): Promise<VerificationResult<VerificationStatus>>;
}
