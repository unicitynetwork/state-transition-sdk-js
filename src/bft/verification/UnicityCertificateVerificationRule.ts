import { InputRecordCurrentHashVerificationRule } from './rule/InputRecordCurrentHashVerificationRule.js';
import { UnicitySealHashMatchesWithRootHashRule } from './rule/UnicitySealHashMatchesWithRootHashRule.js';
import { UnicitySealQuorumSignaturesVerificationRule } from './rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { UnicityCertificateVerificationContext } from './UnicityCertificateVerificationContext.js';
import { CompositeVerificationRule } from '../../verification/CompositeVerificationRule.js';

/**
 * Unicity certificate verification rule.
 */
export class UnicityCertificateVerificationRule extends CompositeVerificationRule<UnicityCertificateVerificationContext> {
  /**
   * Create unicity certificate verification rule.
   */
  public constructor() {
    super(
      new InputRecordCurrentHashVerificationRule(
        new UnicitySealHashMatchesWithRootHashRule(new UnicitySealQuorumSignaturesVerificationRule(), null),
        null,
      ),
      'Verify unicity certificate',
    );
  }
}
