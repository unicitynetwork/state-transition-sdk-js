import { CertifiedMintTransaction } from '../CertifiedMintTransaction.js';
import { IVerificationContext } from './IVerificationContext.js';
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
   * @param {IVerificationContext} verificationContext Shared verification context (trust base + registries) for recursive verification.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  verify(
    transaction: CertifiedMintTransaction,
    verificationContext: IVerificationContext,
  ): Promise<VerificationResult<VerificationStatus>>;
}
