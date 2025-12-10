import { DataHash } from '../../../../crypto/hash/DataHash.js';
import { VerificationResult } from '../../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../../verification/VerificationStatus.js';
import { InclusionProof } from '../../../InclusionProof.js';

/**
 * Input record current hash verification rule.
 */
export class InputRecordCurrentHashVerificationRule {
  public static verify(inclusionProof: InclusionProof): Promise<VerificationResult<VerificationStatus>> {
    if (
      inclusionProof.merkleTreePath.root.equals(
        DataHash.fromImprint(inclusionProof.unicityCertificate.inputRecord.hash),
      )
    ) {
      return Promise.resolve(new VerificationResult('InputRecordCurrentHashVerificationRule', VerificationStatus.OK));
    }

    return Promise.resolve(new VerificationResult('InputRecordCurrentHashVerificationRule', VerificationStatus.FAIL));
  }
}
