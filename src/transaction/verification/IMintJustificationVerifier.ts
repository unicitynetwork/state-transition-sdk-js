import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { CertifiedMintTransaction } from '../CertifiedMintTransaction.js';
import type { Token } from '../Token.js';

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
   * Implementations must not verify tokens embedded in the justification (such
   * as the burned source token of a split) themselves. Instead they hand each
   * embedded token to `nestedTokenCollector`; the driver in {@link Token.verify}
   * verifies the collected tokens iteratively.
   *
   * @param {CertifiedMintTransaction} transaction Transaction whose justification to verify.
   * @param {(token: Token) => void} nestedTokenCollector Receives tokens embedded in the justification that the caller must verify.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  verify(
    transaction: CertifiedMintTransaction,
    nestedTokenCollector: (token: Token) => void,
  ): Promise<VerificationResult<VerificationStatus>>;
}
