import { DataHasherFactory } from '../../../src/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../../src/hash/HashAlgorithm.js';
import { NodeDataHasher } from '../../../src/hash/NodeDataHasher.js';
import { LeafBranch } from '../../../src/mtree/sum/LeafBranch.js';
import { NodeBranch } from '../../../src/mtree/sum/NodeBranch.js';
import { PendingLeafBranch } from '../../../src/mtree/sum/PendingLeafBranch.js';
import { SparseMerkleSumTree } from '../../../src/mtree/sum/SparseMerkleSumTree.js';
import { SparseMerkleSumTreeRootNode } from '../../../src/mtree/sum/SparseMerkleSumTreeRootNode.js';

interface ISumLeaf {
  readonly value: Uint8Array;
  readonly sum: bigint;
}

const textEncoder = new TextEncoder();

describe('Sum-Certifying Tree', function () {
  it('should build a tree with numeric values', async function () {
    const leaves: Map<bigint, ISumLeaf> = new Map([
      [
        0b1000n,
        {
          sum: 10n,
          value: textEncoder.encode('left-1'),
        },
      ],
      [
        0b1001n,
        {
          sum: 20n,
          value: textEncoder.encode('right-1'),
        },
      ],
      [
        0b1010n,
        {
          sum: 30n,
          value: textEncoder.encode('left-2'),
        },
      ],
      [
        0b1011n,
        {
          sum: 40n,
          value: textEncoder.encode('right-2'),
        },
      ],
    ]);

    const tree = new SparseMerkleSumTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    for (const [path, leaf] of leaves.entries()) {
      tree.addLeaf(path, leaf.value, leaf.sum);
    }
    let root = await tree.calculateRoot();
    expect(root.counter).toEqual(100n);

    for (const leaf of leaves.entries()) {
      const path = root.getPath(leaf[0]);
      await expect(path.verify(leaf[0])).resolves.toEqual({
        isPathIncluded: true,
        isPathValid: true,
        isSuccessful: true,
      });

      expect(path.root.counter).toEqual(root.counter);
      expect(path.root.toJSON()).toEqual({
        counter: root.counter.toString(),
        hash: root.hash.toJSON(),
      });
      expect(path.steps.at(0)?.branch?.value).toEqual(leaf[1].value);
      expect(path.steps.at(0)?.branch?.counter).toEqual(leaf[1].sum);
    }

    tree.addLeaf(0b1110n, new Uint8Array(32), 100n);
    root = await tree.calculateRoot();
    expect(root.counter).toEqual(200n);
  });

  it('should throw error on non positive path or sum', async () => {
    const tree = new SparseMerkleSumTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    await expect(tree.addLeaf(-1n, new Uint8Array(32), 100n)).rejects.toThrow('Path must be greater than 0.');
    await expect(tree.addLeaf(1n, new Uint8Array(32), -1n)).rejects.toThrow('Sum must be an unsigned bigint.');
  });

  it('concurrency test', async () => {
    const hasherFactory = new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher);
    const smt = new SparseMerkleSumTree(hasherFactory);
    smt.addLeaf(0b1000n, new Uint8Array(), 10n);
    smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(LeafBranch);
      expect(root.right).toStrictEqual(null);
    });
    smt.addLeaf(0b1001n, new Uint8Array(), 20n);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const left = await new PendingLeafBranch(0b1000n, new Uint8Array(), 10n).finalize(hasherFactory);
    const right = await new PendingLeafBranch(0b1001n, new Uint8Array(), 20n).finalize(hasherFactory);
    await expect(smt.calculateRoot()).resolves.toEqual(
      await SparseMerkleSumTreeRootNode.create(left, right, hasherFactory),
    );
  });

  it('should handle concurrent addLeaf calls', async () => {
    const smt = new SparseMerkleSumTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));

    smt.addLeaf(0b1000n, new Uint8Array(), 1n);
    smt.addLeaf(0b1001n, new Uint8Array(), 1n);
    const root1 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(LeafBranch);
      expect(root.right).toBeInstanceOf(LeafBranch);
    });
    smt.addLeaf(0b1010n, new Uint8Array(), 1n);
    const root2 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(NodeBranch);
      expect(root.right).toBeInstanceOf(LeafBranch);
    });

    smt.addLeaf(0b1011n, new Uint8Array(), 1n);
    const root3 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(NodeBranch);
      expect(root.right).toBeInstanceOf(NodeBranch);
    });
    await Promise.all([root1, root2, root3]);
  });
});
