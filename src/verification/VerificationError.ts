import { VerificationResult } from './VerificationResult.js';

/**
 * Exception thrown when a verification fails.
 */
export class VerificationError extends Error {
  /**
   * Create exception with message and verification result.
   *
   * @param {string} message            message
   * @param {VerificationResult} verificationResult verification result
   */
  public constructor(
    message: string,
    public readonly verificationResult: VerificationResult<unknown>,
  ) {
    super(message);
  }
}
