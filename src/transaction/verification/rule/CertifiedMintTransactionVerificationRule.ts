import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { StateId } from '../../../api/StateId.js';
import { MintSigningService } from '../../../crypto/MintSigningService.js';
import { PayToPublicKeyPredicate } from '../../../predicate/builtin/PayToPublicKeyPredicate.js';
import { PredicateVerifier } from '../../../predicate/verification/PredicateVerifier.js';
import { areUint8ArraysEqual } from '../../../util/TypedArrayUtils.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { CertifiedMintTransaction } from '../../CertifiedMintTransaction.js';

/**
 * Genesis verification rule.
 */
export class CertifiedMintTransactionVerificationRule {
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifier,
    genesis: CertifiedMintTransaction,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];

    const signingService = await MintSigningService.create(genesis.tokenId);
    let result: VerificationResult<unknown> = areUint8ArraysEqual(
      PayToPublicKeyPredicate.create(signingService).encode(),
      genesis.inclusionProof.certificationData?.lockScript.encode(),
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

    result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      genesis.inclusionProof,
      await StateId.fromTransaction(genesis),
    );
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
