export class PathVerificationResult {
  public readonly isSuccessful: boolean;

  public constructor(
    public readonly isPathValid: boolean,
    public readonly isPathIncluded: boolean,
  ) {
    this.isSuccessful = isPathValid && isPathIncluded;
  }
}
