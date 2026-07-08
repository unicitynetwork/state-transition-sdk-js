/**
 * Thrown when a value cannot be deserialized from JSON because it fails a
 * semantic validity check (unsupported version, broken invariants, out-of-range
 * values, etc.).
 */
export class JsonError extends Error {}
