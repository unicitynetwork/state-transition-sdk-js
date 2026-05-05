type CommonPath = { length: bigint; path: bigint };

export function calculateCommonPath(path1: bigint, path2: bigint): CommonPath {
  let path = 1n;
  let mask = 1n;
  let length = 0n;

  while ((path1 & mask) === (path2 & mask) && path < path1 && path < path2) {
    mask <<= 1n;
    length += 1n;
    path = mask | ((mask - 1n) & path1);
  }

  return { length, path };
}

export function getBitAtDepth(data: Uint8Array, depth: number): number {
  depth = Number(depth);
  const byteIndex = Math.floor(depth / 8);
  const bitInByte = depth % 8;
  return (data[byteIndex] >> bitInByte) & 1;
}
