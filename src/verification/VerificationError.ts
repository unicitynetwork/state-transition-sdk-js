import { VerificationResult } from './VerificationResult.js';

/**
 * Exception thrown when a verification fails.
 */
export class VerificationError extends Error {
  public constructor(
    message: string,
    public readonly verificationResult: VerificationResult<unknown>,
  ) {
    super(message);
  }
}
