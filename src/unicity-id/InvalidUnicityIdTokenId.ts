export class InvalidUnicityIdTokenId extends Error {
  public constructor() {
    super('Token ID does not match Unicity ID.');
  }
}
