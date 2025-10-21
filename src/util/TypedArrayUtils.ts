export function areUint8ArraysEqual(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return compareUint8Arrays(a, b) === 0;
}

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
