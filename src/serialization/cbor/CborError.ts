/**
 * Thrown when CBOR encoding or decoding fails (malformed data, non-canonical
 * encoding, type or length mismatches, etc.).
 */
export class CborError extends Error {}
