import { DataHash } from '../../../hash/DataHash.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationResultCode } from '../../../verification/VerificationResultCode.js';
import { VerificationRule } from '../../../verification/VerificationRule.js';
import { UnicityCertificateVerificationContext } from '../UnicityCertificateVerificationContext.js';

/**
 * Input record current hash verification rule.
 */
export class InputRecordCurrentHashVerificationRule extends VerificationRule<UnicityCertificateVerificationContext> {
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
    super('Verifying input record if current hash matches input hash.', onSuccessRule, onFailureRule);
  }

  public verify(context: UnicityCertificateVerificationContext): Promise<VerificationResult> {
    if (context.inputHash.equals(DataHash.fromImprint(context.unicityCertificate.inputRecord.hash))) {
      return Promise.resolve(new VerificationResult(VerificationResultCode.OK));
    }

    return Promise.resolve(
      new VerificationResult(VerificationResultCode.FAIL, 'Input record current hash does not match input hash.'),
    );
  }
}
