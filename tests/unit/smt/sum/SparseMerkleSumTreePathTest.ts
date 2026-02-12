import { DataHash } from '../../../../src/crypto/hash/DataHash.js';
import { HexConverter } from '../../../../src/serialization/HexConverter.js';
import { SparseMerkleSumTreePath } from '../../../../src/smt/sum/SparseMerkleSumTreePath.js';
import { SparseMerkleSumTreePathStep } from '../../../../src/smt/sum/SparseMerkleSumTreePathStep.js';

describe('SparseMerkleTreePath', () => {
  it('should encode and decode to exactly same object', () => {
    const path = new SparseMerkleSumTreePath(DataHash.fromImprint(new Uint8Array(34)), [
      new SparseMerkleSumTreePathStep(0n, new Uint8Array([1, 2, 3]), 10n),
    ]);

    expect(HexConverter.encode(path.toCBOR())).toStrictEqual(
      '8258220000000000000000000000000000000000000000000000000000000000000000000081834043010203410a',
    );
    expect(SparseMerkleSumTreePath.fromCBOR(path.toCBOR())).toStrictEqual(path);
  });

  it('should verify inclusion path', async () => {
    const path = SparseMerkleSumTreePath.fromJSON({
      root: '0000c1e88f562e5e8cf126a64f201831649ca546ebd622c0923adc3f81c500514278',
      steps: [
        { data: '76616c756535', path: '69', value: '5' },
        { data: '8471f8ea3c9a0e50627df4c72d9bd5affbdc12050ee7f4250974ed64949f3b0f', path: '4', value: '5' },
        { data: '66507538ce0fae31018cfc7b01841b5308e7e44306445710acee947ec4a4b2cd', path: '1', value: '5' },
      ],
    });

    expect(await path.verify(0b100010100n)).toEqual({ isPathIncluded: true, isPathValid: true, isSuccessful: true });
  });

  it('should verify non inclusion path', async () => {
    const path = SparseMerkleSumTreePath.fromJSON({
      root: '0000c1e88f562e5e8cf126a64f201831649ca546ebd622c0923adc3f81c500514278',
      steps: [
        { data: '76616c756535', path: '69', value: '5' },
        { data: '8471f8ea3c9a0e50627df4c72d9bd5affbdc12050ee7f4250974ed64949f3b0f', path: '4', value: '5' },
        { data: '66507538ce0fae31018cfc7b01841b5308e7e44306445710acee947ec4a4b2cd', path: '1', value: '5' },
      ],
    });

    expect(await path.verify(0b1000000n)).toEqual({ isPathIncluded: false, isPathValid: true, isSuccessful: false });
  });

  it('should verify empty tree path', async () => {
    const path = SparseMerkleSumTreePath.fromJSON({
      root: '000030f29e4f352749e67e2e514afe08678d58c40e48675e14954df2a494e9ccf0bb',
      steps: [
        { data: null, path: '1', value: '0' },
        { data: null, path: '1', value: '5' },
      ],
    });

    expect(await path.verify(101n)).toEqual({ isPathIncluded: false, isPathValid: true, isSuccessful: false });
  });
});
