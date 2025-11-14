export class LeafInBranchError extends Error {
  public constructor() {
    super('Cannot add leaf inside branch.');
    this.name = 'LeafInBranchError';
  }
}
