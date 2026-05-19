/**
 * Thrown when a value being deserialized from JSON does not match the
 * expected shape (missing fields, wrong types, etc.).
 */
export class InvalidJsonStructureError extends Error {
  public constructor() {
    super('Invalid JSON structure.');
  }
}
