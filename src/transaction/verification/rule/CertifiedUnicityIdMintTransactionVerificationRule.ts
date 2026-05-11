import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { SignaturePredicate } from '../../../predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../../../predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../../../predicate/verification/PredicateVerifierService.js';
import { CertifiedUnicityIdMintTransaction } from '../../../unicity-id/CertifiedUnicityIdMintTransaction.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';

/**
 * Genesis verification rule for unicity-id mint transactions.
 *
 * Always verifies the inclusion proof against the trust base. When an
 * `issuerPublicKey` is supplied, it additionally pins the genesis lock script
 * to that issuer; this is meaningful only when verifying a token received from
 * an external party. On the local mint path the caller authored the genesis,
 * so the issuer pin is omitted (pass `null`).
 */
export class CertifiedUnicityIdMintTransactionVerificationRule {
  /**
   * @param trustBase          Root trust base used to verify the inclusion proof.
   * @param predicateVerifier  Predicate verifier service.
   * @param genesis            Certified unicity-id mint transaction to verify.
   * @param issuerPublicKey    Trusted issuer public key to pin the lock script
   *                           against, or `null` to skip the issuer pin.
   */
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    genesis: CertifiedUnicityIdMintTransaction,
    issuerPublicKey: Uint8Array | null = null,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];

    if (issuerPublicKey !== null) {
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
    }

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
