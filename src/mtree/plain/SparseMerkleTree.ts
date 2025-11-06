import { Branch } from './Branch.js';
import { LeafBranch } from './LeafBranch.js';
import { LeafInBranchError } from './LeafInBranchError.js';
import { LeafOutOfBoundsError } from './LeafOutOfBoundsError.js';
import { PendingBranch } from './PendingBranch.js';
import { PendingLeafBranch } from './PendingLeafBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';
import { calculateCommonPath } from './SparseMerkleTreePathUtils.js';
import { SparseMerkleTreeRootNode } from './SparseMerkleTreeRootNode.js';
import { IDataHasher } from '../../hash/IDataHasher.js';
import { IDataHasherFactory } from '../../hash/IDataHasherFactory.js';

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
   * Adds a leaf to the tree at the specified path with the given value.
   * @param path The path where the leaf should be added.
   * @param _data The value of the leaf as a Uint8Array.
   * @throws Error will throw an error if the path is less than 1.
   */
  public async addLeaf(path: bigint, data: Uint8Array): Promise<void> {
    if (path < 1n) {
      throw new Error('Path must be greater than 0.');
    }

    const isRight = path & 1n;
    data = new Uint8Array(data);
    const branchPromise = isRight ? this.right : this.left;
    const newBranchPromise = branchPromise.then((branch) =>
      branch ? this.buildTree(branch, path, data) : new PendingLeafBranch(path, data),
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
      (branch): Promise<Branch | null> => (branch ? branch.finalize(this.factory) : Promise.resolve(null)),
    );
    this.right = this.right?.then(
      (branch): Promise<Branch | null> => (branch ? branch.finalize(this.factory) : Promise.resolve(null)),
    );
    const [left, right] = await Promise.all([
      this.left as Promise<Branch | null>,
      this.right as Promise<Branch | null>,
    ]);

    return SparseMerkleTreeRootNode.create(left, right, this.factory);
  }

  private buildTree(branch: PendingBranch, remainingPath: bigint, value: Uint8Array): PendingBranch {
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

      const oldBranch = new PendingLeafBranch(branch.path >> commonPath.length, branch.data);
      const newBranch = new PendingLeafBranch(remainingPath >> commonPath.length, value);
      return new PendingNodeBranch(commonPath.path, isRight ? oldBranch : newBranch, isRight ? newBranch : oldBranch);
    }

    // If node branch is split in the middle
    if (commonPath.path < branch.path) {
      const newBranch = new PendingLeafBranch(remainingPath >> commonPath.length, value);
      const oldBranch = new PendingNodeBranch(branch.path >> commonPath.length, branch.left, branch.right);
      return new PendingNodeBranch(commonPath.path, isRight ? oldBranch : newBranch, isRight ? newBranch : oldBranch);
    }

    if (isRight) {
      return new PendingNodeBranch(
        branch.path,
        branch.left,
        this.buildTree(branch.right, remainingPath >> commonPath.length, value),
      );
    }

    return new PendingNodeBranch(
      branch.path,
      this.buildTree(branch.left, remainingPath >> commonPath.length, value),
      branch.right,
    );
  }
}
