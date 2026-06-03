import { FinalizedBranch } from './FinalizedBranch.js';
import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { LeafInBranchError } from '../LeafInBranchError.js';
import { LeafOutOfBoundsError } from '../LeafOutOfBoundsError.js';
import { PendingBranch } from './PendingBranch.js';
import { PendingLeafBranch } from './PendingLeafBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';
import { calculateCommonPath } from '../SparseMerkleTreePathUtils.js';
import { SparseMerkleTreeRootNode } from './SparseMerkleTreeRootNode.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { BitString } from '../../util/BitString.js';

/**
 * Sparse Merkle Tree implementation.
 */
export class SparseMerkleTree {
  private left: Promise<PendingBranch | null> = Promise.resolve(null);
  private right: Promise<PendingBranch | null> = Promise.resolve(null);

  /**
   * Creates a new instance of SparseMerkleTree.
   * @param factory The factory to create data hashers.
   */
  public constructor(public readonly factory: IDataHasherFactory<IDataHasher>) {}

  /**
   * Add a leaf to the tree.
   *
   * @param {Uint8Array} key Leaf key.
   * @param {Uint8Array} data Leaf data bytes.
   * @returns {Promise<void>} Resolves when the leaf has been inserted.
   */
  public async addLeaf(key: Uint8Array, data: Uint8Array): Promise<void> {
    // TODO: Add length check
    data = new Uint8Array(data);
    key = new Uint8Array(key);
    const path = BitString.fromBytesReversedLSB(key).toBigInt();
    const isRight = Number(path & 1n);
    const branchPromise = isRight ? this.right : this.left;
    const newBranchPromise = branchPromise.then((branch) =>
      branch ? this.buildTree(branch, path, 0, key, data) : new PendingLeafBranch(path, key, data),
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
   * @returns A promise that resolves to the MerkleTreeRootNode representing the root of the tree.
   */
  public async calculateRoot(): Promise<SparseMerkleTreeRootNode> {
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

    return SparseMerkleTreeRootNode.create(left, right, this.factory);
  }

  private buildTree(
    branch: PendingBranch,
    remainingPath: bigint,
    depth: number,
    key: Uint8Array,
    value: Uint8Array,
  ): PendingBranch {
    const commonPath = calculateCommonPath(remainingPath, branch.path);
    const commonPathLength = Number(commonPath.length);
    const isRight = Number((remainingPath >> commonPath.length) & 1n);

    if (commonPath.path === remainingPath) {
      throw new LeafInBranchError();
    }

    // If a leaf must be split from the middle
    if (branch instanceof PendingLeafBranch || branch instanceof FinalizedLeafBranch) {
      if (commonPath.path === branch.path) {
        throw new LeafOutOfBoundsError();
      }

      const oldBranch = new PendingLeafBranch(branch.path >> commonPath.length, branch.key, branch.data);
      const newBranch = new PendingLeafBranch(remainingPath >> commonPath.length, key, value);
      return new PendingNodeBranch(
        commonPath.path,
        depth + commonPathLength,
        isRight ? oldBranch : newBranch,
        isRight ? newBranch : oldBranch,
      );
    }

    // If node branch is split in the middle
    if (commonPath.path < branch.path) {
      const newBranch = new PendingLeafBranch(remainingPath >> commonPath.length, key, value);
      const oldBranch = new PendingNodeBranch(
        branch.path >> commonPath.length,
        branch.depth,
        branch.left,
        branch.right,
      );
      return new PendingNodeBranch(
        commonPath.path,
        depth + commonPathLength,
        isRight ? oldBranch : newBranch,
        isRight ? newBranch : oldBranch,
      );
    }

    if (isRight) {
      return new PendingNodeBranch(
        branch.path,
        branch.depth,
        branch.left,
        this.buildTree(branch.right, remainingPath >> commonPath.length, depth + commonPathLength, key, value),
      );
    }

    return new PendingNodeBranch(
      branch.path,
      branch.depth,
      this.buildTree(branch.left, remainingPath >> commonPath.length, depth + commonPathLength, key, value),
      branch.right,
    );
  }
}
