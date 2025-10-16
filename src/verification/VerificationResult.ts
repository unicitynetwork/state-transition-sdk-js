import { VerificationResultCode } from './VerificationResultCode.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Verification result implementation.
 */
export class VerificationResult {
  public constructor(
    public readonly status: VerificationResultCode,
    public readonly message: string = '',
    public readonly results: VerificationResult[] = [],
  ) {
    this.results = results.slice();
  }

  /**
   * Is verification successful.
   *
   * @return success if verification status is ok
   */
  public get isSuccessful(): boolean {
    return this.status == VerificationResultCode.OK;
  }

  /**
   * Create verification result from child results, all has to succeed.
   *
   * @param message  message for the verification result
   * @param children child results
   * @return verification result
   */
  public static fromChildren(message: string, children: VerificationResult[]): VerificationResult {
    return new VerificationResult(
      children.reduce(
        (code: VerificationResultCode, result: VerificationResult) =>
          result.isSuccessful ? code : VerificationResultCode.FAIL,
        VerificationResultCode.OK,
      ),
      message,
      children,
    );
  }

  public toString(): string {
    return dedent`
      VerificationResult:
        isSuccessful: ${this.status}
        message: ${this.message}
        results: ${this.results.map((result) => result.toString()).join('\n')}
    `;
  }
}
