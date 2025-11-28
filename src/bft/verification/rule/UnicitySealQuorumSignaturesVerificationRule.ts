import { DataHash } from '../../../hash/DataHash.js';
import { DataHasher } from '../../../hash/DataHasher.js';
import { HashAlgorithm } from '../../../hash/HashAlgorithm.js';
import { SigningService } from '../../../sign/SigningService.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationResultCode } from '../../../verification/VerificationResultCode.js';
import { VerificationRule } from '../../../verification/VerificationRule.js';
import { RootTrustBaseNodeInfo } from '../../RootTrustBase.js';
import { UnicityCertificateVerificationContext } from '../UnicityCertificateVerificationContext.js';

/**
 * Rule to verify that the UnicitySeal contains valid quorum signatures.
 */
export class UnicitySealQuorumSignaturesVerificationRule extends VerificationRule<UnicityCertificateVerificationContext> {
  /**
   * Create the rule with subsequent rules for success and failure.
   *
   * @param onSuccessRule rule to execute on success
   * @param onFailureRule rule to execute on failure
   */
  public constructor(
    onSuccessRule: VerificationRule<UnicityCertificateVerificationContext> | null = null,
    onFailureRule: VerificationRule<UnicityCertificateVerificationContext> | null = null,
  ) {
    super('Verifying UnicitySeal hash matches with tree root hash.', onSuccessRule, onFailureRule);
  }

  private static async verifySignature(
    node: RootTrustBaseNodeInfo | null,
    signature: Uint8Array,
    hash: DataHash,
  ): Promise<VerificationResult> {
    if (node == null) {
      return new VerificationResult(VerificationResultCode.FAIL, 'No root node defined');
    }

    const result = await SigningService.verifyWithPublicKey(hash, signature.slice(0, -1), node.signingKey);
    if (!result) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Signature verification failed.');
    }

    return new VerificationResult(VerificationResultCode.OK);
  }

  public async verify(context: UnicityCertificateVerificationContext): Promise<VerificationResult> {
    const unicitySeal = context.unicityCertificate.unicitySeal;
    const trustBase = context.trustBase;

    const hash = await new DataHasher(HashAlgorithm.SHA256).update(unicitySeal.withoutSignatures().toCBOR()).digest();

    const results = await Promise.all(
      Array.from(unicitySeal.signatures?.entries() ?? []).map(([nodeId, signature]) =>
        UnicitySealQuorumSignaturesVerificationRule.verifySignature(
          trustBase.rootNodes.find((node) => node.nodeId === nodeId) ?? null,
          signature,
          hash,
        ).then((result) => VerificationResult.fromChildren(`Verifying node '${nodeId}' signature.`, [result])),
      ),
    );

    const successful = results.reduce(
      (previousValue, currentValue) => (currentValue.isSuccessful ? previousValue + 1 : previousValue),
      0,
    );
    if (successful >= trustBase.quorumThreshold) {
      return new VerificationResult(VerificationResultCode.OK, '', results);
    }

    return new VerificationResult(VerificationResultCode.FAIL, 'Quorum threshold not reached.', results);
  }
}
