import { calculateCommonPath } from '../../../src/smt/SparseMerkleTreePathUtils.js';

describe('Sparse Merkle Tree tests', function () {
  it('calculate common path', () => {
    expect(calculateCommonPath(0b11n, 0b111101111n)).toStrictEqual({ length: 1n, path: 0b11n });
    expect(calculateCommonPath(0b111101111n, 0b11n)).toStrictEqual({ length: 1n, path: 0b11n });
    expect(calculateCommonPath(0b110010000n, 0b100010000n)).toStrictEqual({
      length: 7n,
      path: 0b10010000n,
    });
  });
});
