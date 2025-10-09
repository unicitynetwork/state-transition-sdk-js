export class PathVerificationResult {
  public readonly result: boolean;

  public constructor(
    public readonly isPathValid: boolean,
    public readonly isPathIncluded: boolean,
  ) {
    this.result = isPathValid && isPathIncluded;
  }
}
