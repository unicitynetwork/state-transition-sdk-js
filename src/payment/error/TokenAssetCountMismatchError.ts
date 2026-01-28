export class TokenAssetCountMismatchError extends Error {
  public constructor() {
    super('Token and split tokens asset counts differ.');
  }
}
