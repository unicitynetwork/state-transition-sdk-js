type CommonPath = { length: number; path: bigint };

export function calculateCommonPath(path1: bigint, path2: bigint): CommonPath {
  let path = 1n;
  let mask = 1n;
  let length = 0;

  while ((path1 & mask) === (path2 & mask) && path < path1 && path < path2) {
    mask <<= 1n;
    length += 1;
    path = mask | ((mask - 1n) & path1);
  }

  return { length, path };
}

/**
 * Region committed by an interior node: the `depth`-bit common prefix of all leaves in the node's
 * sub-tree. The `i`th lowest bit of path will be the `i mod 8`th lowest bit in the `i div 8`th
 * byte of the returned 32-byte array (so the packing is little-endian); the remaining bits of the array
 * are set to zero.
 */
export function pathToRegion(path: bigint, depth: number): Uint8Array {
  const region = new Uint8Array(32);
  const fullBytes = Math.floor(depth / 8);
  const remainderBits = depth % 8;

  let bits = path;
  for (let j = 0; j < fullBytes; j++, bits >>= 8n) {
    region[j] = Number(bits & 0xffn);
  }
  if (remainderBits > 0) {
    region[fullBytes] = Number(bits & 0xffn) & ((1 << remainderBits) - 1);
  }
  return region;
}

export function getBitAtDepth(data: Uint8Array, depth: number): number {
  depth = Number(depth);
  const byteIndex = Math.floor(depth / 8);
  const bitInByte = depth % 8;
  return (data[byteIndex] >> bitInByte) & 1;
}
