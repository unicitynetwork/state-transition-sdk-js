/**
 * Hashing error
 */
export class HashError extends Error {
  public constructor(message: string) {
    super(message);

    this.name = 'HashError';
  }
}
