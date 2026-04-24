import { ShardTreeCertificate } from '../../../api/bft/ShardTreeCertificate.js';
import { StateId } from '../../../api/StateId.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';

export class ShardIdMatchesStateIdRule {
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
