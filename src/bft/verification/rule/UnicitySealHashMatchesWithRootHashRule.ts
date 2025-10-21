import { numberToBytesBE } from '@noble/curves/utils.js';

import { DataHasher } from '../../../hash/DataHasher.js';
import { HashAlgorithm } from '../../../hash/HashAlgorithm.js';
import { CborSerializer } from '../../../serializer/cbor/CborSerializer.js';
import { compareUint8Arrays, areUint8ArraysEqual } from '../../../util/TypedArrayUtils.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationResultCode } from '../../../verification/VerificationResultCode.js';
import { VerificationRule } from '../../../verification/VerificationRule.js';
import { UnicityCertificate } from '../../UnicityCertificate.js';
import { UnicityCertificateVerificationContext } from '../UnicityCertificateVerificationContext.js';

/**
 * Rule to verify that the UnicitySeal hash matches the root hash of the UnicityTreeCertificate.
 */
export class UnicitySealHashMatchesWithRootHashRule extends VerificationRule<UnicityCertificateVerificationContext> {
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

  public async verify(context: UnicityCertificateVerificationContext): Promise<VerificationResult> {
    const shardTreeCertificateRootHash = await UnicityCertificate.calculateShardTreeCertificateRootHash(
      context.unicityCertificate.inputRecord,
      context.unicityCertificate.technicalRecordHash,
      context.unicityCertificate.shardConfigurationHash,
      context.unicityCertificate.shardTreeCertificate,
    );

    if (shardTreeCertificateRootHash == null) {
      return new VerificationResult(
        VerificationResultCode.FAIL,
        'Could not calculate shard tree certificate root hash.',
      );
    }

    const unicityTreeCertificate = context.unicityCertificate.unicityTreeCertificate;
    const key = numberToBytesBE(unicityTreeCertificate.partitionIdentifier, 4);

    let result = await new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeByteString(new Uint8Array([0x01]))) // LEAF
      .update(CborSerializer.encodeByteString(key))
      .update(
        CborSerializer.encodeByteString(
          (
            await new DataHasher(HashAlgorithm.SHA256)
              .update(CborSerializer.encodeByteString(shardTreeCertificateRootHash.data))
              .digest()
          ).data,
        ),
      )
      .digest();

    for (const step of unicityTreeCertificate.steps) {
      const stepKey = numberToBytesBE(step.key, 4);

      const hasher = new DataHasher(HashAlgorithm.SHA256)
        .update(CborSerializer.encodeByteString(new Uint8Array([0x00]))) // NODE
        .update(CborSerializer.encodeByteString(stepKey));

      if (compareUint8Arrays(key, stepKey) > 0) {
        hasher.update(CborSerializer.encodeByteString(step.hash)).update(CborSerializer.encodeByteString(result.data));
      } else {
        hasher.update(CborSerializer.encodeByteString(result.data)).update(CborSerializer.encodeByteString(step.hash));
      }

      result = await hasher.digest();
    }

    const unicitySealHash = context.unicityCertificate.unicitySeal.hash;

    if (!areUint8ArraysEqual(unicitySealHash, result.data)) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Unicity seal hash does not match tree root.');
    }

    return new VerificationResult(VerificationResultCode.OK);
  }
}
