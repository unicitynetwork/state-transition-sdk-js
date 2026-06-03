/**
 * Thrown when a sparse Merkle tree operation would extend the tree past a
 * leaf node, which is not allowed.
 */
export class LeafOutOfBoundsError extends Error {
  public constructor() {
    super('Cannot extend tree through leaf.');
    this.name = 'LeafOutOfBoundsError';
  }
}
