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
