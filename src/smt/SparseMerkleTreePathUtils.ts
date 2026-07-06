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
 * Region committed by an interior node (v6a): the node's `depth`-bit key prefix, packed into 32
 * bytes in the byte-order-preserving, LSB-in-byte convention. `path` is the absolute node/key path
 * (leading sentinel bit at `depth`); its low `depth` bits are the prefix. Bit `i` lives in byte
 * `⌊i/8⌋` least-significant-first, so the packing is little-endian.
 */
export function pathToRegion(path: bigint, depth: number): Uint8Array {
  const bits = path & ((1n << BigInt(depth)) - 1n);
  const region = new Uint8Array(32);
  for (let j = 0; j * 8 < depth; j++) {
    region[j] = Number((bits >> BigInt(8 * j)) & 0xffn);
  }
  return region;
}

export function getBitAtDepth(data: Uint8Array, depth: number): number {
  depth = Number(depth);
  const byteIndex = Math.floor(depth / 8);
  const bitInByte = depth % 8;
  return (data[byteIndex] >> bitInByte) & 1;
}
