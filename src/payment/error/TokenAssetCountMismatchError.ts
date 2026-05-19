/**
 * Thrown when a token split has a different number of assets than the
 * source token's payment data.
 */
export class TokenAssetCountMismatchError extends Error {
  public constructor() {
    super('Token and split tokens asset counts differ.');
  }
}
