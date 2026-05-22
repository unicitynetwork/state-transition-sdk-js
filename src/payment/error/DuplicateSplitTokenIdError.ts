/**
 * Thrown when two split requests derive the same token id, which would
 * collide in the sum trees.
 */
export class DuplicateSplitTokenIdError extends Error {
  public constructor(tokenId: string) {
    super(`Duplicate token id across split requests: ${tokenId}.`);
  }
}
