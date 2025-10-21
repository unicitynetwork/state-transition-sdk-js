import { IVerificationContext } from './IVerificationContext.js';
import { VerificationResult } from './VerificationResult.js';
import { VerificationResultCode } from './VerificationResultCode.js';
import { VerificationRule } from './VerificationRule.js';

/**
 * A composite verification rule that chains multiple verification rules together.
 *
 * <p>This class allows you to create a sequence of verification rules where each rule can lead to
 * another rule based on the result of the verification. The first rule in the chain is provided at
 * construction, and subsequent rules can be determined dynamically based on the outcome of each
 * verification step.
 *
 * <p>When the {@code verify} method is called, it starts with the first rule and continues to
 * execute subsequent rules based on whether the previous rule was successful or not. The final
 * result is a composite {@code VerificationResult} that includes the results of all executed
 * rules.
 *
 * @param <C> the type of context used for verification
 */
export abstract class CompositeVerificationRule<C extends IVerificationContext> extends VerificationRule<C> {
  /**
   * Constructs a {@code CompositeVerificationRule} with the specified message and the first rule in
   * the chain.
   *
   * @param message   a descriptive message for the composite rule
   * @param firstRule the first verification rule to execute in the chain
   * @param onSuccessRule
   * @param onFailureRule
   */
  public constructor(
    public readonly firstRule: VerificationRule<C>,
    message: string,
    onSuccessRule: VerificationRule<C> | null = null,
    onFailureRule: VerificationRule<C> | null = null,
  ) {
    super(message, onSuccessRule, onFailureRule);

    this.firstRule = firstRule;
  }

  public async verify(context: C): Promise<VerificationResult> {
    let rule: VerificationRule<C> | null = this.firstRule;
    const results: VerificationResult[] = [];

    while (rule != null) {
      const result = await rule.verify(context);
      results.push(result);
      rule = rule.getNextRule(result.isSuccessful ? VerificationResultCode.OK : VerificationResultCode.FAIL);
    }

    return VerificationResult.fromChildren(this.message, results);
  }
}
