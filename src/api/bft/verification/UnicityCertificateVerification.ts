import { UnicitySealHashMatchesWithRootHashRule } from './rule/UnicitySealHashMatchesWithRootHashRule.js';
import { UnicitySealQuorumSignaturesVerificationRule } from './rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { InclusionProof } from '../../InclusionProof.js';
import { RootTrustBase } from '../RootTrustBase.js';

/**
 * Result of a {@link UnicityCertificateVerification} run.
 */
class UnicityCertificateVerificationResult extends VerificationResult<VerificationStatus> {
  private constructor(status: VerificationStatus, results: VerificationResult<unknown>[]) {
    super('UnicityCertificateVerification', status, '', results);
  }

  /**
   * Build a failed verification result.
   *
   * @param {VerificationResult<unknown>[]} results Child rule results.
   * @returns {UnicityCertificateVerificationResult} Failed result.
   */
  public static fail(results: VerificationResult<unknown>[]): UnicityCertificateVerificationResult {
    return new UnicityCertificateVerificationResult(VerificationStatus.FAIL, results);
  }

  /**
   * Build a successful verification result.
   *
   * @param {VerificationResult<unknown>[]} results Child rule results.
   * @returns {UnicityCertificateVerificationResult} Successful result.
   */
  public static ok(results: VerificationResult<unknown>[]): UnicityCertificateVerificationResult {
    return new UnicityCertificateVerificationResult(VerificationStatus.OK, results);
  }
}

/**
 * Unicity certificate verification.
 */
export class UnicityCertificateVerification {
  /**
   * Verify the unicity certificate in an inclusion proof against the trust base.
   *
   * @param {RootTrustBase} trustBase Root trust base.
   * @param {InclusionProof} inclusionProof Inclusion proof carrying the unicity certificate.
   * @returns {Promise<UnicityCertificateVerificationResult>} Verification outcome.
   */
  public static async verify(
    trustBase: RootTrustBase,
    inclusionProof: InclusionProof,
  ): Promise<UnicityCertificateVerificationResult> {
    const results: VerificationResult<VerificationStatus>[] = [];

    if (!inclusionProof.unicityCertificate.unicitySeal.networkId.equals(trustBase.networkId)) {
      results.push(new VerificationResult('UnicitySealNetworkMatchesTrustBaseRule', VerificationStatus.FAIL));
      return UnicityCertificateVerificationResult.fail(results);
    }
    results.push(new VerificationResult('UnicitySealNetworkMatchesTrustBaseRule', VerificationStatus.OK));

    let result = await UnicitySealHashMatchesWithRootHashRule.verify(inclusionProof.unicityCertificate);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return UnicityCertificateVerificationResult.fail(results);
    }

    result = await UnicitySealQuorumSignaturesVerificationRule.verify(
      trustBase,
      inclusionProof.unicityCertificate.unicitySeal,
    );
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return UnicityCertificateVerificationResult.fail(results);
    }

    return UnicityCertificateVerificationResult.ok(results);
  }
}
