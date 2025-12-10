import { InputRecordCurrentHashVerificationRule } from './rule/InputRecordCurrentHashVerificationRule.js';
import { UnicitySealHashMatchesWithRootHashRule } from './rule/UnicitySealHashMatchesWithRootHashRule.js';
import { UnicitySealQuorumSignaturesVerificationRule } from './rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { InclusionProof } from '../../InclusionProof.js';
import { RootTrustBase } from '../RootTrustBase.js';

class UnicityCertificateVerificationResult extends VerificationResult<VerificationStatus> {
  private constructor(status: VerificationStatus, results: VerificationResult<unknown>[]) {
    super('UnicityCertificateVerification', status, '', results);
  }

  public static fail(results: VerificationResult<unknown>[]): UnicityCertificateVerificationResult {
    return new UnicityCertificateVerificationResult(VerificationStatus.FAIL, results);
  }

  public static ok(results: VerificationResult<unknown>[]): UnicityCertificateVerificationResult {
    return new UnicityCertificateVerificationResult(VerificationStatus.OK, results);
  }
}

/**
 * Unicity certificate verification.
 */
export class UnicityCertificateVerification {
  public static async verify(
    trustBase: RootTrustBase,
    inclusionProof: InclusionProof,
  ): Promise<UnicityCertificateVerificationResult> {
    const results: VerificationResult<VerificationStatus>[] = [];
    let result = await InputRecordCurrentHashVerificationRule.verify(inclusionProof);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return UnicityCertificateVerificationResult.fail(results);
    }

    result = await UnicitySealHashMatchesWithRootHashRule.verify(inclusionProof.unicityCertificate);
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
