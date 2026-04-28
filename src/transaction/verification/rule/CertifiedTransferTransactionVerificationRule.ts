import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { PredicateVerifierService } from '../../../predicate/verification/PredicateVerifierService.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { CertifiedTransferTransaction } from '../../CertifiedTransferTransaction.js';

/**
 * Transfer transaction verification rule.
 */
export class CertifiedTransferTransactionVerificationRule {
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    transaction: CertifiedTransferTransaction,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];
    const result: VerificationResult<unknown> = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      transaction.inclusionProof,
      transaction,
    );
    results.push(result);

    if (result.status !== InclusionProofVerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedTransferTransactionVerificationRule',
        VerificationStatus.FAIL,
        `Inclusion proof verification failed: ${result.status?.toString()}`,
        results,
      );
    }

    return new VerificationResult('CertifiedTransferTransactionVerificationRule', VerificationStatus.OK, '', results);
  }
}
