import { Branch } from './Branch.js';
import { LeafBranch } from './LeafBranch.js';
import { PendingBranch } from './PendingBranch.js';
import { PendingLeafBranch } from './PendingLeafBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';
import { SparseMerkleSumTreeRootNode } from './SparseMerkleSumTreeRootNode.js';
import { IDataHasher } from '../../hash/IDataHasher.js';
import { IDataHasherFactory } from '../../hash/IDataHasherFactory.js';
import { LeafInBranchError } from '../plain/LeafInBranchError.js';
import { LeafOutOfBoundsError } from '../plain/LeafOutOfBoundsError.js';
import { calculateCommonPath } from '../plain/SparseMerkleTreePathUtils.js';

/**
 * Sparse Merkle Sum Tree implementation.
 */
export class SparseMerkleSumTree {
  private left: Promise<PendingBranch | null> = Promise.resolve(null);
  private right: Promise<PendingBranch | null> = Promise.resolve(null);

  /**
   * Creates a new instance of SparseMerkleSumTree.
   * @param factory The factory to create data hashers.
   */
  public constructor(private readonly factory: IDataHasherFactory<IDataHasher>) {}

  /**
   * Adds a leaf to the tree at the specified path with the given value and sum.
   * @param path The path where the leaf should be added.
   * @param _data The data of the leaf as a Uint8Array.
   * @param value The sum associated with the leaf.
   * @throws Error will throw an error if the path is less than 1 or if the sum is negative.
   */
  public async addLeaf(path: bigint, _data: Uint8Array, value: bigint): Promise<void> {
    if (value < 0n) {
      throw new Error('Sum must be an unsigned bigint.');
    }

    if (path < 1n) {
      throw new Error('Path must be greater than 0.');
    }

    const isRight = path & 1n;
    const data = new Uint8Array(_data);
    const branchPromise = isRight ? this.right : this.left;
    const newBranchPromise = branchPromise.then((branch) =>
      branch ? this.buildTree(branch, path, data, value) : new PendingLeafBranch(path, data, value),
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
   * @returns A promise that resolves to the MerkleSumTreeRootNode representing the root of the tree.
   */
  public async calculateRoot(): Promise<SparseMerkleSumTreeRootNode> {
    this.left = this.left.then(
      (branch): Promise<Branch | null> => (branch ? branch.finalize(this.factory) : Promise.resolve(null)),
    );
    this.right = this.right?.then(
      (branch): Promise<Branch | null> => (branch ? branch.finalize(this.factory) : Promise.resolve(null)),
    );
    const [left, right] = await Promise.all([
      this.left as Promise<Branch | null>,
      this.right as Promise<Branch | null>,
    ]);

    return SparseMerkleSumTreeRootNode.create(left, right, this.factory);
  }

  private buildTree(branch: PendingBranch, remainingPath: bigint, data: Uint8Array, value: bigint): PendingBranch {
    const commonPath = calculateCommonPath(remainingPath, branch.path);
    const isRight = (remainingPath >> commonPath.length) & 1n;

    if (commonPath.path === remainingPath) {
      throw new LeafInBranchError();
    }

    // If a leaf must be split from the middle
    if (branch instanceof PendingLeafBranch || branch instanceof LeafBranch) {
      if (commonPath.path === branch.path) {
        throw new LeafOutOfBoundsError();
      }

      const oldBranch = new PendingLeafBranch(branch.path >> commonPath.length, branch.data, branch.value);
      const newBranch = new PendingLeafBranch(remainingPath >> commonPath.length, data, value);
      return new PendingNodeBranch(commonPath.path, isRight ? oldBranch : newBranch, isRight ? newBranch : oldBranch);
    }

    // If node branch is split in the middle
    if (commonPath.path < branch.path) {
      const newBranch = new PendingLeafBranch(remainingPath >> commonPath.length, data, value);
      const oldBranch = new PendingNodeBranch(branch.path >> commonPath.length, branch.left, branch.right);
      return new PendingNodeBranch(commonPath.path, isRight ? oldBranch : newBranch, isRight ? newBranch : oldBranch);
    }

    if (isRight) {
      return new PendingNodeBranch(
        branch.path,
        branch.left,
        this.buildTree(branch.right, remainingPath >> commonPath.length, data, value),
      );
    }

    return new PendingNodeBranch(
      branch.path,
      this.buildTree(branch.left, remainingPath >> commonPath.length, data, value),
      branch.right,
    );
  }
}
