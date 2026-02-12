import { dedent } from '../util/StringUtils.js';

/**
 * Verification result implementation.
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
