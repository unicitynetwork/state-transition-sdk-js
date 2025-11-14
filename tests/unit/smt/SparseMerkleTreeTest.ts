import { DataHash } from '../../../src/hash/DataHash.js';
import { DataHasherFactory } from '../../../src/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../../src/hash/HashAlgorithm.js';
import { NodeDataHasher } from '../../../src/hash/NodeDataHasher.js';
import { FinalizedLeafBranch } from '../../../src/mtree/plain/FinalizedLeafBranch.js';
import { FinalizedNodeBranch } from '../../../src/mtree/plain/FinalizedNodeBranch.js';
import { PendingLeafBranch } from '../../../src/mtree/plain/PendingLeafBranch.js';
import { SparseMerkleTree } from '../../../src/mtree/plain/SparseMerkleTree.js';
import { SparseMerkleTreeRootNode } from '../../../src/mtree/plain/SparseMerkleTreeRootNode.js';

describe('Sparse Merkle Tree tests', function () {
  const leavesSparse = [0b110010000n, 0b100000000n, 0b100010000n, 0b110000000n, 0b101100000n, 0b100010100n];

  it('tree should be half calculated', async () => {
    const hashFactory = new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher);
    const smt = new SparseMerkleTree(hashFactory);

    smt.addLeaf(0b10n, new Uint8Array([1, 2, 3]));
    await smt.calculateRoot();
    await smt.addLeaf(0b11n, new Uint8Array([1, 2, 3, 4]));
    const testSmt = smt as unknown as {
      left: Promise<{ path: bigint; hash: DataHash }>;
      right: Promise<{ path: bigint }>;
    };
    await expect(testSmt.left).resolves.toEqual(
      await new PendingLeafBranch(2n, new Uint8Array([1, 2, 3])).finalize(hashFactory),
    );

    await expect(testSmt.right).resolves.toEqual(new PendingLeafBranch(3n, new Uint8Array([1, 2, 3, 4])));
  });

  it('should verify the tree', async () => {
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const textEncoder = new TextEncoder();

    for (let i = 0; i < leavesSparse.length; i++) {
      smt.addLeaf(leavesSparse[i], textEncoder.encode(`value${i}`));
    }

    await expect(smt.addLeaf(0b10000000n, textEncoder.encode('OnPath'))).rejects.toThrow(
      'Cannot add leaf inside branch.',
    );
    await expect(smt.addLeaf(0b1000000000n, textEncoder.encode('ThroughLeaf'))).rejects.toThrow(
      'Cannot extend tree through leaf.',
    );

    const root = await smt.calculateRoot();

    expect(root.hash.toJSON()).toStrictEqual('0000d2fcbfec1b01fc404a03776b7b351786bf91bf94321a006c23376ccb1807faf8');
  });

  it('get path', async () => {
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const textEncoder = new TextEncoder();

    for (let i = 0; i < leavesSparse.length; i++) {
      smt.addLeaf(leavesSparse[i], textEncoder.encode(`value${i}`));
    }

    const root = await smt.calculateRoot();

    let path = root.getPath(0b100110000n);
    await expect(path.verify(0b100110000n)).resolves.toEqual({
      isPathIncluded: false,
      isPathValid: true,
      isSuccessful: false,
    });

    path = root.getPath(0b110010000n);
    await expect(path.verify(0b110010000n)).resolves.toEqual({
      isPathIncluded: true,
      isPathValid: true,
      isSuccessful: true,
    });
    await expect(path.verify(0b11010n)).resolves.toEqual({
      isPathIncluded: false,
      isPathValid: true,
      isSuccessful: false,
    });
    path = root.getPath(0b100n);
    await expect(path.verify(0b100n)).resolves.toEqual({
      isPathIncluded: true,
      isPathValid: true,
      isSuccessful: true,
    });

    const emptyRoot = await new SparseMerkleTree(
      new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher),
    ).calculateRoot();
    path = emptyRoot.getPath(0b100n);
    await expect(path.verify(0b100n)).resolves.toEqual({
      isPathIncluded: false,
      isPathValid: true,
      isSuccessful: false,
    });
  });

  it('concurrency test', async () => {
    const hasherFactory = new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher);
    const smt = new SparseMerkleTree(hasherFactory);
    smt.addLeaf(0b1000n, new Uint8Array());
    smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(FinalizedLeafBranch);
      expect(root.right).toStrictEqual(null);
    });
    smt.addLeaf(0b1001n, new Uint8Array());
    const left = await new PendingLeafBranch(0b1000n, new Uint8Array()).finalize(hasherFactory);
    const right = await new PendingLeafBranch(0b1001n, new Uint8Array()).finalize(hasherFactory);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(smt.calculateRoot()).resolves.toEqual(
      await SparseMerkleTreeRootNode.create(left, right, hasherFactory),
    );
  });

  it('should handle concurrent addLeaf calls', async () => {
    const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
    const textEncoder = new TextEncoder();

    smt.addLeaf(0b1000n, textEncoder.encode('A'));
    smt.addLeaf(0b1001n, textEncoder.encode('B'));
    const root1 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(FinalizedLeafBranch);
      expect(root.right).toBeInstanceOf(FinalizedLeafBranch);
    });
    smt.addLeaf(0b1010n, textEncoder.encode('C'));
    const root2 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(FinalizedNodeBranch);
      expect(root.right).toBeInstanceOf(FinalizedLeafBranch);
    });

    smt.addLeaf(0b1011n, textEncoder.encode('D'));
    const root3 = smt.calculateRoot().then((root) => {
      expect(root.left).toBeInstanceOf(FinalizedNodeBranch);
      expect(root.right).toBeInstanceOf(FinalizedNodeBranch);
    });
    await Promise.all([root1, root2, root3]);
  });
});
