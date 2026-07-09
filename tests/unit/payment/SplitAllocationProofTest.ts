import { DataHasherFactory } from '../../../src/crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { NodeDataHasher } from '../../../src/crypto/hash/NodeDataHasher.js';
import { SplitAllocationProof } from '../../../src/payment/SplitAllocationProof.js';
import { SparseMerkleSumTree } from '../../../src/smt/radixsum/SparseMerkleSumTree.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

describe('SplitAllocationProof', () => {
  const factory = new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher);

  function data(seed: number): Uint8Array {
    const d = new Uint8Array(32);
    d.fill(seed);
    return d;
  }

  it('calculates the root and inclusion proof correctly', async () => {
    const keyA = new Uint8Array(32);
    keyA[31] = 0x01;
    const keyB = new Uint8Array(32); // all zero

    const tree = new SparseMerkleSumTree(factory);
    await tree.addLeaf(keyA, data(0xaa), 10n);
    await tree.addLeaf(keyB, data(0xbb), 20n);
    const root = await tree.calculateRoot();

    expect(HexConverter.encode(root.hash.data)).toEqual(
      '42e8d38b002c192bb7a6f121692f55b46626f68b6e9ca59b7f638aecfb4632b1',
    );
    expect(root.value).toEqual(30n);

    const proof = SplitAllocationProof.create(root, keyA);
    expect(proof.length).toBe(1);
    expect((await proof.calculateRoot(keyA, data(0xaa), 10n)).sum).toEqual(30n);
    expect(await proof.verify(keyA, data(0xaa), 10n, root.hash, 30n)).toBe(true);
  });
});
