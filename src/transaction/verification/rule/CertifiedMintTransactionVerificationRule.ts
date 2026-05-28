import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { MintSigningService } from '../../../crypto/MintSigningService.js';
import { SignaturePredicate } from '../../../predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../../../predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../../../predicate/verification/PredicateVerifierService.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { CertifiedMintTransaction } from '../../CertifiedMintTransaction.js';
import { MintJustificationVerifierService } from '../MintJustificationVerifierService.js';

/**
 * Genesis verification rule.
 */
export class CertifiedMintTransactionVerificationRule {
  /**
   * Verify a certified mint genesis.
   *
   * @param {RootTrustBase} trustBase Root trust base used to verify the inclusion proof.
   * @param {PredicateVerifierService} predicateVerifier Predicate verifier service.
   * @param {MintJustificationVerifierService} mintJustificationVerifier Verifier for the mint justification.
   * @param {CertifiedMintTransaction} genesis Certified mint transaction to verify.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    mintJustificationVerifier: MintJustificationVerifierService,
    genesis: CertifiedMintTransaction,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];

    if (!genesis.networkId.equals(trustBase.networkId)) {
      results.push(new VerificationResult('MintNetworkMatchesTrustBaseRule', VerificationStatus.FAIL));
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        'Mint network does not match trust base.',
        results,
      );
    }
    results.push(new VerificationResult('MintNetworkMatchesTrustBaseRule', VerificationStatus.OK));

    const signingService = await MintSigningService.create(genesis.tokenId);
    const expectedLockScript = EncodedPredicate.fromPredicate(SignaturePredicate.fromSigningService(signingService));
    let result: VerificationResult<unknown> = EncodedPredicate.equals(
      expectedLockScript,
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

    return new VerificationResult('CertifiedMintTransactionVerificationRule', VerificationStatus.OK, '', results);
  }
}
