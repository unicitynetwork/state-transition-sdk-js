import { ShardTreeCertificate } from '../../../api/bft/ShardTreeCertificate.js';
import { StateId } from '../../../api/StateId.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';

/**
 * Verifies that a state id falls under the shard identified by a shard tree
 * certificate.
 */
export class ShardIdMatchesStateIdRule {
  /**
   * Verify that `stateId` is prefixed by the certificate's shard id.
   *
   * @param {StateId} stateId State id under verification.
   * @param {ShardTreeCertificate} shardTreeCertificate Shard tree certificate carrying the expected shard.
   * @returns {VerificationResult<VerificationStatus>} OK if the shard is empty or a prefix, FAIL otherwise.
   */
  public static verify(
    stateId: StateId,
    shardTreeCertificate: ShardTreeCertificate,
  ): VerificationResult<VerificationStatus> {
    const shardId = shardTreeCertificate.shard;
    if (shardId.length === 0) {
      return new VerificationResult('ShardIdMatchesStateIdRule', VerificationStatus.OK);
    }

    if (!shardId.isPrefixOf(stateId.data)) {
      return new VerificationResult('ShardIdMatchesStateIdRule', VerificationStatus.FAIL);
    }

    return new VerificationResult('ShardIdMatchesStateIdRule', VerificationStatus.OK);
  }
}
