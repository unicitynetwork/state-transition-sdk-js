export class LeafOutOfBoundsError extends Error {
  public constructor() {
    super('Cannot extend tree through leaf.');
    this.name = 'LeafOutOfBoundsError';
  }
}
