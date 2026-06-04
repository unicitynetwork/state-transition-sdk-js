/**
 * Returns true if both arrays are the same reference, both nullish, or contain
 * the same bytes in the same order.
 *
 * @param {Uint8Array|null|undefined} a First array.
 * @param {Uint8Array|null|undefined} b Second array.
 * @returns {boolean} True if the arrays are equal.
 */
export function areUint8ArraysEqual(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return compareUint8Arrays(a, b) === 0;
}

/**
 * Lexicographic comparison of two byte arrays. Arrays of different lengths
 * are ordered by length.
 *
 * @param {Uint8Array} a First array.
 * @param {Uint8Array} b Second array.
 * @returns {number} Negative if `a` sorts before `b`, positive if after, zero if equal.
 */
export function compareUint8Arrays(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) {
    return a.length - b.length;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }

  return 0;
}
