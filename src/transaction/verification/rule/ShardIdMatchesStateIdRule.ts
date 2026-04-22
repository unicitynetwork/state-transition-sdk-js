import { ShardTreeCertificate } from '../../../api/bft/ShardTreeCertificate.js';
import { StateId } from '../../../api/StateId.js';
import { BitString } from '../../../util/BitString.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';

export class ShardIdMatchesStateIdRule {
  public static verify(
    stateId: StateId,
    shardTreeCertificate: ShardTreeCertificate,
  ): VerificationResult<VerificationStatus> {
    const depth = shardTreeCertificate.siblingHashList.length;
    if (depth === 0) {
      return new VerificationResult('ShardIdMatchesStateIdRule', VerificationStatus.OK);
    }

    const mask = (1n << BigInt(depth)) - 1n;
    const shardPath = BitString.fromBytesReversedLSB(shardTreeCertificate.shard).toBigInt();
    const stateIdPath = BitString.fromBytesReversedLSB(stateId.data).toBigInt();

    if ((shardPath & mask) !== (stateIdPath & mask)) {
      return new VerificationResult('ShardIdMatchesStateIdRule', VerificationStatus.FAIL);
    }

    return new VerificationResult('ShardIdMatchesStateIdRule', VerificationStatus.OK);
  }
}
