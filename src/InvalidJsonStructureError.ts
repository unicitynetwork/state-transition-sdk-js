export class InvalidJsonStructureError extends Error {
  public constructor() {
    super('Invalid JSON structure.');
  }
}
