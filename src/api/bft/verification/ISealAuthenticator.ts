import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { UnicitySeal } from '../UnicitySeal.js';

/**
 * Authenticates a unicity seal (network, epoch and quorum signatures) against the verifier's own trusted authority.
 * Implementations decide the trust policy and may memoize.
 */
export interface ISealAuthenticator {
  /**
   * Identity of the trusted authority and verifier policy this authenticator applies (anchored network, epoch, signer
   * entries, quorum). Part of every cache and session key derived from its verdicts.
   */
  readonly identity: string;

  /**
   * @param {UnicitySeal} seal Seal to authenticate.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Outcome, never a success for a seal that was not
   *   authenticated by the trusted authority.
   */
  authenticate(seal: UnicitySeal): Promise<VerificationResult<VerificationStatus>>;
}
