/**
 * Thrown when a sparse Merkle tree insertion would place a leaf at a path
 * that is already occupied by a branch node.
 */
export class LeafInBranchError extends Error {
  public constructor() {
    super('Cannot add leaf inside branch.');
    this.name = 'LeafInBranchError';
  }
}
