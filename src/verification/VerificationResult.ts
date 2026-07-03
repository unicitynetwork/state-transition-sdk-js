import { VerificationStatus } from './VerificationStatus.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Outcome of one verification rule. Carries the rule name, a status of any
 * type `S`, an optional message, and child results from nested rules so that
 * a full verification trace can be rendered.
 *
 * @typeParam S Status type produced by the rule.
 */
export class VerificationResult<S> {
  public constructor(
    public readonly rule: string,
    public readonly status: S,
    public readonly message: string = '',
    public readonly results: VerificationResult<unknown>[] = [],
  ) {
    this.results = results.slice();
  }

  /**
   * Aggregate child results into a single {@link VerificationStatus} result: OK
   * when every child is OK, otherwise FAIL. The children are retained as the
   * verification trace.
   *
   * @param {string} rule Rule name for the aggregate result.
   * @param {VerificationResult<VerificationStatus>[]} results Child results to aggregate.
   * @param {string} [message] Optional message for the aggregate result.
   * @returns {VerificationResult<VerificationStatus>} Aggregated result.
   */
  public static fromResults(
    rule: string,
    results: VerificationResult<VerificationStatus>[],
    message: string = '',
  ): VerificationResult<VerificationStatus> {
    const status = results.every((result) => result.status === VerificationStatus.OK)
      ? VerificationStatus.OK
      : VerificationStatus.FAIL;
    return new VerificationResult(rule, status, message, results);
  }

  /**
   * @returns {string} String representation of the verification result.
   */
  public toString(): string {
    return dedent`
      VerificationResult[${this.rule}]:
        Status: ${this.status}
        Message: ${this.message}
        Results: [
          ${this.results.map((result) => result.toString()).join('\n')}
        ]`;
  }
}
