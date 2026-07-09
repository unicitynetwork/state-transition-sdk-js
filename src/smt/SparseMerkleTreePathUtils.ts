/**
 * Length of the common big-endian bit prefix shared by keys `a` and `b`, capped at `maxDepth`
 * (depth 0 is the most significant bit of byte 0). Used to find where a new key bifurcates from an
 * existing branch: pass `256` for a leaf (compare the whole key) or the node's depth for an interior
 * branch (its stored region is only meaningful up to that depth).
 */
export function commonPrefixLength(a: Uint8Array, b: Uint8Array, maxDepth: number): number {
  const fullBytes = maxDepth >> 3;
  for (let i = 0; i < fullBytes; i++) {
    if (a[i] !== b[i]) {
      return (i << 3) + Math.clz32(a[i] ^ b[i]) - 24;
    }
  }

  const remainderBits = maxDepth & 7;
  if (remainderBits > 0) {
    const diff = (a[fullBytes] ^ b[fullBytes]) & (0xff << (8 - remainderBits));
    if (diff !== 0) {
      return (fullBytes << 3) + Math.clz32(diff) - 24;
    }
  }

  return maxDepth;
}

/**
 * The key's first `depth` bits, with the remaining bits of the 32-byte array zeroed.
 */
export function regionFromKey(key: Uint8Array, depth: number): Uint8Array {
  const region = new Uint8Array(32);
  const fullBytes = depth >> 3;
  const remainderBits = depth & 7;
  region.set(key.subarray(0, fullBytes));
  if (remainderBits > 0) {
    region[fullBytes] = key[fullBytes] & ((0xff << (8 - remainderBits)) & 0xff);
  }
  return region;
}

/**
 * Big-endian bit of `data` at the given depth per the Yellowpaper: depth 0 is the most significant
 * bit of `data[0]` (`data[0] & 0x80`) and depth 255 is the least significant bit of `data[31]`.
 */
export function getBitAtDepth(data: Uint8Array, depth: number): number {
  depth = Number(depth);
  if (!Number.isInteger(depth) || depth < 0 || depth >= data.length * 8) {
    throw new Error(`Depth ${depth} is out of bounds for a ${data.length}-byte value.`);
  }
  const byteIndex = depth >> 3;
  const bitInByte = depth & 7;
  return (data[byteIndex] >> (7 - bitInByte)) & 1;
}

/**
 * Render the first `length` big-endian bits of `data` as a `'0'`/`'1'` string: whole bytes first,
 * then the high bits of the partial byte.
 */
export function bitsToString(data: Uint8Array, length: number): string {
  if (!Number.isInteger(length) || length < 0 || length > data.length * 8) {
    throw new Error(`Length ${length} is out of bounds for a ${data.length}-byte value.`);
  }
  const fullBytes = length >> 3;
  const remainderBits = length & 7;
  let bits = '';
  for (let i = 0; i < fullBytes; i++) {
    bits += data[i].toString(2).padStart(8, '0');
  }
  if (remainderBits > 0) {
    bits += data[fullBytes].toString(2).padStart(8, '0').slice(0, remainderBits);
  }
  return bits;
}
