import { IVerificationContext } from './IVerificationContext.js';
import { VerificationResult } from './VerificationResult.js';
import { VerificationResultCode } from './VerificationResultCode.js';

/**
 * Verification rule base class.
 *
 * @param <C> verification context
 */
export abstract class VerificationRule<C extends IVerificationContext> {
  /**
   * Create the rule with subsequent rules for success and failure.
   *
   * @param message       rule message
   * @param onSuccessRule rule to execute on success
   * @param onFailureRule rule to execute on failure
   */
  protected constructor(
    public readonly message: string,
    private readonly onSuccessRule: VerificationRule<C> | null = null,
    private readonly onFailureRule: VerificationRule<C> | null = null,
  ) {}

  /**
   * Get next verification rule based on verification result.
   *
   * @param resultCode result of current verification rule
   * @return next rule or null if no rule exists for given result
   */
  public getNextRule(resultCode: VerificationResultCode): VerificationRule<C> | null {
    switch (resultCode) {
      case VerificationResultCode.OK:
        return this.onSuccessRule;
      case VerificationResultCode.FAIL:
        return this.onFailureRule;
      default:
        return null;
    }
  }

  /**
   * Verify context against current rule.
   *
   * @param {C} context verification context
   * @return verification result
   */
  public abstract verify(context: C): Promise<VerificationResult>;
}
