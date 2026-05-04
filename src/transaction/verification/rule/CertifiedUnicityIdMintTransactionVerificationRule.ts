import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { SignaturePredicate } from '../../../predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../../../predicate/EncodedPredicate.js';
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
    issuerPublicKey: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];

    const expectedLockScript = EncodedPredicate.fromPredicate(SignaturePredicate.create(issuerPublicKey));
    if (!EncodedPredicate.equals(expectedLockScript, genesis.lockScript)) {
      results.push(new VerificationResult('IsLockScriptValidVerificationRule', VerificationStatus.FAIL));
      return new VerificationResult(
        'CertifiedUnicityIdMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        'Lock script does not match expected unicity-id issuer.',
        results,
      );
    }
    results.push(new VerificationResult('IsLockScriptValidVerificationRule', VerificationStatus.OK));

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
