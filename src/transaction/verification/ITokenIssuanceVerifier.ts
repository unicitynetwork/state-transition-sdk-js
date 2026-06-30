import { CertifiedMintTransaction } from '../CertifiedMintTransaction.js';
import { TokenIssuanceVerifierService } from './TokenIssuanceVerifierService.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { TokenType } from '../TokenType.js';

/**
 * Application-supplied policy for tokens of a single {@link TokenType}. Plugged
 * into {@link TokenIssuanceVerifierService}, which dispatches by token type and
 * decides whether a token's genesis data is acceptable for its type.
 *
 * Registering a policy is an application trust decision: cryptographic
 * certification alone does not authorize an issuance, so a payment consumer
 * should verify both the payload structure and its own issuance policy here.
 */
export interface ITokenIssuanceVerifier {
  /**
   * Token type this policy applies to.
   */
  get tokenType(): TokenType;

  /**
   * Verify the genesis data and any application-level issuance policy.
   *
   * @param {CertifiedMintTransaction} transaction Genesis mint transaction to verify.
   * @param {TokenIssuanceVerifierService} tokenIssuanceVerifierService Service available for recursive verification.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  verify(
    transaction: CertifiedMintTransaction,
    tokenIssuanceVerifierService: TokenIssuanceVerifierService,
  ): Promise<VerificationResult<VerificationStatus>>;
}
