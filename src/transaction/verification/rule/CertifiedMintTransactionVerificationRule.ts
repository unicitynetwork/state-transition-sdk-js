import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { MintSigningService } from '../../../crypto/MintSigningService.js';
import { PayToPublicKeyPredicate } from '../../../predicate/builtin/PayToPublicKeyPredicate.js';
import { EncodedPredicate } from '../../../predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../../../predicate/verification/PredicateVerifierService.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { CertifiedMintTransaction } from '../../CertifiedMintTransaction.js';
import { MintJustificationVerifierService } from '../../MintJustificationVerifierService.js';

/**
 * Genesis verification rule.
 */
export class CertifiedMintTransactionVerificationRule {
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    mintJustificationVerifier: MintJustificationVerifierService,
    genesis: CertifiedMintTransaction,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];

    const signingService = await MintSigningService.create(genesis.tokenId);
    let result: VerificationResult<unknown> = EncodedPredicate.equals(
      PayToPublicKeyPredicate.fromSigningService(signingService),
      genesis.inclusionProof.certificationData?.lockScript,
    )
      ? new VerificationResult('IsLockScriptValidVerificationRule', VerificationStatus.OK)
      : new VerificationResult('IsLockScriptValidVerificationRule', VerificationStatus.FAIL);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        'Invalid lock script',
        results,
      );
    }

    result = await mintJustificationVerifier.verify(genesis);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        'Invalid mint justification',
        results,
      );
    }

    result = await InclusionProofVerificationRule.verify(trustBase, predicateVerifier, genesis.inclusionProof, genesis);
    results.push(result);
    if (result.status !== InclusionProofVerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        `Inclusion proof verification failed: ${result.status?.toString()}`,
        results,
      );
    }

    return new VerificationResult('CertifiedMintTransactionVerificationRule', VerificationStatus.OK, '', results);
  }
}
