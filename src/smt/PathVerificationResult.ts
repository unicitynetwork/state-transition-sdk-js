/**
 * Outcome of verifying a sparse Merkle tree path. The verification is
 * successful only when the path is both well-formed and proves inclusion of
 * the leaf.
 */
export class PathVerificationResult {
  public readonly isSuccessful: boolean;

  public constructor(
    public readonly isPathValid: boolean,
    public readonly isPathIncluded: boolean,
  ) {
    this.isSuccessful = isPathValid && isPathIncluded;
  }
}
