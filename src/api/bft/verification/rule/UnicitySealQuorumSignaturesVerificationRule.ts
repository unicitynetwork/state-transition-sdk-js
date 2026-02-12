import { DataHash } from '../../../../crypto/hash/DataHash.js';
import { SigningService } from '../../../../crypto/secp256k1/SigningService.js';
import { VerificationResult } from '../../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../../verification/VerificationStatus.js';
import { RootTrustBase } from '../../RootTrustBase.js';
import { UnicitySeal } from '../../UnicitySeal.js';

/**
 * Rule to verify that the UnicitySeal contains valid quorum signatures.
 */
export class UnicitySealQuorumSignaturesVerificationRule {
  public static async verify(
    trustBase: RootTrustBase,
    unicitySeal: UnicitySeal,
  ): Promise<VerificationResult<VerificationStatus>> {
    const hash = await unicitySeal.calculateHash();

    const results = await Promise.all(
      Array.from(unicitySeal.signatures?.entries() ?? []).map(([nodeId, signature]) =>
        UnicitySealQuorumSignaturesVerificationRule.verifySignature(trustBase, nodeId, signature, hash),
      ),
    );

    const successful = results.reduce(
      (previousValue, currentValue) =>
        currentValue.status === VerificationStatus.OK ? previousValue + 1 : previousValue,
      0,
    );
    if (successful >= trustBase.quorumThreshold) {
      return new VerificationResult(
        'UnicitySealQuorumSignaturesVerificationRule',
        VerificationStatus.OK,
        'Unicity quorum signatures verification threshold reached',
        results,
      );
    }

    return new VerificationResult(
      'UnicitySealQuorumSignaturesVerificationRule',
      VerificationStatus.FAIL,
      'Not enough unicity quorum signatures verification succeeded',
      results,
    );
  }

  private static async verifySignature(
    trustBase: RootTrustBase,
    nodeId: string,
    signature: Uint8Array,
    hash: DataHash,
  ): Promise<VerificationResult<VerificationStatus>> {
    const node = trustBase.rootNodes.find((node) => node.nodeId === nodeId) ?? null;
    if (node == null) {
      return new VerificationResult(
        `SignatureVerificationRule[${nodeId}]`,
        VerificationStatus.FAIL,
        'No root node defined',
      );
    }

    const result = await SigningService.verifyWithPublicKey(hash, signature.slice(0, -1), node.signingKey);
    if (!result) {
      return new VerificationResult(
        `SignatureVerificationRule[${nodeId}]`,
        VerificationStatus.FAIL,
        'Signature verification failed',
      );
    }

    return new VerificationResult(`SignatureVerificationRule[${nodeId}]}`, VerificationStatus.OK);
  }
}
