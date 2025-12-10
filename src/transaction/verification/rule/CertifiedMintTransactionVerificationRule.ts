import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { StateId } from '../../../api/StateId.js';
import { MintSigningService } from '../../../crypto/MintSigningService.js';
import { PayToPublicKeyPredicate } from '../../../predicate/PayToPublicKeyPredicate.js';
import { PredicateVerifierFactory } from '../../../predicate/verification/PredicateVerifierFactory.js';
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
    predicateVerifier: PredicateVerifierFactory,
    genesis: CertifiedMintTransaction,
  ): Promise<VerificationResult<VerificationStatus>> {
    if (!genesis.inclusionProof.certificationData) {
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        'Invalid inclusion proof: missing certification data.',
      );
    }

    const signingService = await MintSigningService.create(genesis.tokenId);
    if (
      !areUint8ArraysEqual(
        PayToPublicKeyPredicate.create(signingService).encode(),
        genesis.inclusionProof.certificationData.lockScript.encode(),
      )
    ) {
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        'Invalid lock script in genesis transaction.',
      );
    }

    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      genesis.inclusionProof,
      await StateId.fromTransaction(genesis),
    );
    if (result.status !== InclusionProofVerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedMintTransactionVerificationRule',
        VerificationStatus.FAIL,
        `Inclusion proof verification failed: ${result.status.toString()}`,
        [result],
      );
    }

    return new VerificationResult(
      'CertifiedMintTransactionVerificationRule',
      result.status === InclusionProofVerificationStatus.OK ? VerificationStatus.OK : VerificationStatus.FAIL,
      '',
      [result],
    );
  }
}
