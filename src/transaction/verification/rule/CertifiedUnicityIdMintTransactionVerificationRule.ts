import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { PredicateVerifierService } from '../../../predicate/verification/PredicateVerifierService.js';
import { CertifiedUnicityIdMintTransaction } from '../../../unicity-id/CertifiedUnicityIdMintTransaction.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';

/**
 * Genesis verification rule.
 */
export class CertifiedUnicityIdMintTransactionVerificationRule {
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    genesis: CertifiedUnicityIdMintTransaction,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];

    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      genesis.inclusionProof,
      genesis,
    );
    results.push(result);
    if (result.status !== InclusionProofVerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedUnicityIdMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        `Inclusion proof verification failed: ${result.status?.toString()}`,
        results,
      );
    }

    return new VerificationResult(
      'CertifiedUnicityIdMintTransactionVerificationRule',
      VerificationStatus.OK,
      '',
      results,
    );
  }
}
