/**
 * Thrown when a sparse Merkle tree insertion targets a key that is already
 * present in the tree.
 */
export class LeafExistsError extends Error {
  public constructor() {
    super('Leaf already exists.');
    this.name = 'LeafExistsError';
  }
}
