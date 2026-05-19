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
