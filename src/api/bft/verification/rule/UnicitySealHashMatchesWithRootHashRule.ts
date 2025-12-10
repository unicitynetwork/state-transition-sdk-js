import { numberToBytesBE } from '@noble/curves/utils.js';

import { DataHasher } from '../../../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../../crypto/hash/HashAlgorithm.js';
import { CborSerializer } from '../../../../serialization/cbor/CborSerializer.js';
import { areUint8ArraysEqual, compareUint8Arrays } from '../../../../util/TypedArrayUtils.js';
import { VerificationResult } from '../../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../../verification/VerificationStatus.js';
import { UnicityCertificate } from '../../UnicityCertificate.js';

/**
 * Rule to verify that the UnicitySeal hash matches the root hash of the UnicityTreeCertificate.
 */
export class UnicitySealHashMatchesWithRootHashRule {
  public static async verify(unicityCertificate: UnicityCertificate): Promise<VerificationResult<VerificationStatus>> {
    const shardTreeCertificateRootHash = await UnicityCertificate.calculateShardTreeCertificateRootHash(
      unicityCertificate.inputRecord,
      unicityCertificate.technicalRecordHash,
      unicityCertificate.shardConfigurationHash,
      unicityCertificate.shardTreeCertificate,
    );

    const unicityTreeCertificate = unicityCertificate.unicityTreeCertificate;
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

    const unicitySealHash = unicityCertificate.unicitySeal.hash;

    if (!areUint8ArraysEqual(unicitySealHash, result.data)) {
      return new VerificationResult('UnicitySealHashMatchesWithRootHashRule', VerificationStatus.FAIL);
    }

    return new VerificationResult('UnicitySealHashMatchesWithRootHashRule', VerificationStatus.OK);
  }
}
