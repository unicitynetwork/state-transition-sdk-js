import { DataHasherFactory } from '../../../../src/crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../../../src/crypto/hash/HashAlgorithm.js';
import { NodeDataHasher } from '../../../../src/crypto/hash/NodeDataHasher.js';
import { SplitAllocationProof } from '../../../../src/payment/SplitAllocationProof.js';
import { SparseMerkleSumTree } from '../../../../src/smt/radixsum/SparseMerkleSumTree.js';

describe('Radix Sparse Merkle Sum Tree', () => {
  const factory = new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher);

  function key(...bytes: number[]): Uint8Array {
    const k = new Uint8Array(32);
    k.set(bytes);
    return k;
  }

  function data(seed: number): Uint8Array {
    const d = new Uint8Array(32);
    d.fill(seed);
    return d;
  }

  const leaves = [
    { data: data(1), key: key(0b10010000), value: 5n },
    { data: data(2), key: key(0b00000000), value: 10n },
    { data: data(3), key: key(0b00010000), value: 20n },
    { data: data(4), key: key(0b10000000), value: 40n },
    { data: data(5), key: key(0b01100000), value: 80n },
    { data: data(6), key: key(0b00010100), value: 160n },
  ];

  async function build(entries: typeof leaves): Promise<SparseMerkleSumTree> {
    const tree = new SparseMerkleSumTree(factory);
    for (const leaf of entries) {
      await tree.addLeaf(leaf.key, leaf.data, leaf.value);
    }
    return tree;
  }

  it('reconstructs the root sum and verifies every leaf', async () => {
    const root = await (await build(leaves)).calculateRoot();
    const total = leaves.reduce((sum, leaf) => sum + leaf.value, 0n);
    expect(root.value).toEqual(total);

    for (const leaf of leaves) {
      const proof = SplitAllocationProof.create(root, leaf.key);
      expect((await proof.calculateRoot(leaf.key, leaf.data, leaf.value)).sum).toEqual(total);
      expect(await proof.verify(leaf.key, leaf.data, leaf.value, root.hash, total)).toBe(true);
    }
  });

  it('rejects a tampered leaf amount', async () => {
    const root = await (await build(leaves)).calculateRoot();
    const proof = SplitAllocationProof.create(root, leaves[0].key);
    expect(await proof.verify(leaves[0].key, leaves[0].data, leaves[0].value + 1n, root.hash, leaves[0].value)).toBe(
      false,
    );
  });

  it('rejects a duplicate key', async () => {
    const tree = await build([leaves[0]]);
    await expect(tree.addLeaf(leaves[0].key, leaves[0].data, leaves[0].value)).rejects.toThrow('Leaf already exists.');
  });

  it('produces an empty proof for a single-leaf tree', async () => {
    const root = await (await build([leaves[0]])).calculateRoot();
    const proof = SplitAllocationProof.create(root, leaves[0].key);
    expect(proof.length).toBe(0);
    expect(root.value).toEqual(leaves[0].value);

    expect((await proof.calculateRoot(leaves[0].key, leaves[0].data, leaves[0].value)).sum).toEqual(leaves[0].value);
    expect(await proof.verify(leaves[0].key, leaves[0].data, leaves[0].value, root.hash, leaves[0].value)).toBe(true);
  });

  it('survives a CBOR round-trip of the inclusion proof', async () => {
    const root = await (await build(leaves)).calculateRoot();
    const total = leaves.reduce((sum, leaf) => sum + leaf.value, 0n);
    const proof = SplitAllocationProof.create(root, leaves[4].key);
    const decoded = SplitAllocationProof.fromCBOR(proof.toCBOR());
    expect(await decoded.verify(leaves[4].key, leaves[4].data, leaves[4].value, root.hash, total)).toBe(true);
  });
});
