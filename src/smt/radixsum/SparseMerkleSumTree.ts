import { FinalizedBranch } from './FinalizedBranch.js';
import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { PendingBranch } from './PendingBranch.js';
import { PendingLeafBranch } from './PendingLeafBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';
import { SparseMerkleSumTreeRootNode } from './SparseMerkleSumTreeRootNode.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { LeafExistsError } from '../LeafExistsError.js';
import { getBitAtDepth, regionFromKey } from '../SparseMerkleTreePathUtils.js';

/**
 * Radix sparse Merkle sum tree. It reuses the radix sparse Merkle tree structure
 * (big-endian key routing, path-compressed binary trie, absolute bifurcation
 * depths) and additionally commits a positive amount at every leaf and the
 * accumulated sum at every internal node, so any inclusion proof also proves the
 * leaf amount is part of the committed root total.
 */
export class SparseMerkleSumTree {
  private left: Promise<PendingBranch | null> = Promise.resolve(null);
  private right: Promise<PendingBranch | null> = Promise.resolve(null);

  /**
   * Creates a new instance of SparseMerkleSumTree.
   * @param factory The factory to create data hashers.
   */
  public constructor(public readonly factory: IDataHasherFactory<IDataHasher>) {}

  /**
   * Add a leaf to the tree.
   *
   * @param {Uint8Array} key 32-byte leaf key.
   * @param {Uint8Array} data 32-byte leaf data.
   * @param {bigint} value Leaf amount in the range `[1, 2^256)`.
   * @returns {Promise<void>} Resolves when the leaf has been inserted.
   * @throws {Error} If the value is not a positive 256-bit integer, or the key or data is not 32 bytes.
   */
  public async addLeaf(key: Uint8Array, data: Uint8Array, value: bigint): Promise<void> {
    if (value <= 0n || value >= 1n << 256n) {
      throw new Error('Value must be a positive 256-bit integer.');
    }

    if (key.length !== 32) {
      throw new Error('Key must be 32 bytes long.');
    }

    if (data.length !== 32) {
      throw new Error('Data must be 32 bytes long.');
    }

    data = new Uint8Array(data);
    key = new Uint8Array(key);
    const isRight = getBitAtDepth(key, 0);
    const branchPromise = isRight ? this.right : this.left;
    const newBranchPromise = branchPromise.then((branch) =>
      branch ? this.buildTree(branch, key, data, value) : new PendingLeafBranch(key, data, value),
    );

    if (isRight) {
      this.right = newBranchPromise.catch(() => branchPromise);
    } else {
      this.left = newBranchPromise.catch(() => branchPromise);
    }

    await newBranchPromise;
  }

  /**
   * Calculates the hashes for tree and returns root of the tree for given state.
   * @returns A promise that resolves to the SumTreeRootNode representing the root of the tree.
   */
  public async calculateRoot(): Promise<SparseMerkleSumTreeRootNode> {
    this.left = this.left.then(
      (branch): Promise<FinalizedBranch | null> => (branch ? branch.finalize(this.factory) : Promise.resolve(null)),
    );
    this.right = this.right?.then(
      (branch): Promise<FinalizedBranch | null> => (branch ? branch.finalize(this.factory) : Promise.resolve(null)),
    );
    const [left, right] = await Promise.all([
      this.left as Promise<FinalizedBranch | null>,
      this.right as Promise<FinalizedBranch | null>,
    ]);

    return SparseMerkleSumTreeRootNode.create(left, right, this.factory);
  }

  private buildTree(branch: PendingBranch, key: Uint8Array, data: Uint8Array, value: bigint): PendingBranch {
    if (branch instanceof PendingLeafBranch || branch instanceof FinalizedLeafBranch) {
      const depth = branch.calculateSplitDepth(key);
      if (depth === branch.depth) {
        throw new LeafExistsError();
      }

      // If a leaf must be split from the middle
      const isRight = getBitAtDepth(key, depth);
      const newBranch = new PendingLeafBranch(key, data, value);
      return PendingNodeBranch.create(
        regionFromKey(key, depth),
        depth,
        isRight ? branch : newBranch,
        isRight ? newBranch : branch,
      );
    }

    const depth = branch.calculateSplitDepth(key);
    const isRight = getBitAtDepth(key, depth);

    // If node branch is split in the middle
    if (depth < branch.depth) {
      const newBranch = new PendingLeafBranch(key, data, value);
      return PendingNodeBranch.create(
        regionFromKey(key, depth),
        depth,
        isRight ? branch : newBranch,
        isRight ? newBranch : branch,
      );
    }

    // Key belongs inside current node
    if (isRight) {
      return branch.withRightBranch(this.buildTree(branch.right, key, data, value));
    }

    return branch.withLeftBranch(this.buildTree(branch.left, key, data, value));
  }
}
