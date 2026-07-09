import { FinalizedBranch } from './FinalizedBranch.js';
import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { LeafExistsError } from '../LeafExistsError.js';
import { PendingBranch } from './PendingBranch.js';
import { PendingLeafBranch } from './PendingLeafBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';
import { commonPrefixLength, getBitAtDepth, regionFromKey } from '../SparseMerkleTreePathUtils.js';
import { SparseMerkleTreeRootNode } from './SparseMerkleTreeRootNode.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';

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
   * @param {Uint8Array} key 32-byte leaf key.
   * @param {Uint8Array} data Leaf data bytes (arbitrary length).
   * @returns {Promise<void>} Resolves when the leaf has been inserted.
   * @throws {Error} If the key is not 32 bytes.
   */
  public async addLeaf(key: Uint8Array, data: Uint8Array): Promise<void> {
    if (key.length !== 32) {
      throw new Error('Key must be 32 bytes long.');
    }

    data = new Uint8Array(data);
    key = new Uint8Array(key);
    const isRight = getBitAtDepth(key, 0);
    const branchPromise = isRight ? this.right : this.left;
    const newBranchPromise = branchPromise.then((branch) =>
      branch ? this.buildTree(branch, key, data) : new PendingLeafBranch(key, data),
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

  private buildTree(branch: PendingBranch, key: Uint8Array, data: Uint8Array): PendingBranch {
    if (branch instanceof PendingLeafBranch || branch instanceof FinalizedLeafBranch) {
      const depth = commonPrefixLength(key, branch.path, 256);
      if (depth === 256) {
        throw new LeafExistsError();
      }

      // If a leaf must be split from the middle
      const isRight = getBitAtDepth(key, depth);
      const newBranch = new PendingLeafBranch(key, data);
      return new PendingNodeBranch(
        regionFromKey(key, depth),
        depth,
        isRight ? branch : newBranch,
        isRight ? newBranch : branch,
      );
    }

    const depth = commonPrefixLength(key, branch.path, branch.depth);
    const isRight = getBitAtDepth(key, depth);

    // If node branch is split in the middle
    if (depth < branch.depth) {
      const newBranch = new PendingLeafBranch(key, data);
      return new PendingNodeBranch(
        regionFromKey(key, depth),
        depth,
        isRight ? branch : newBranch,
        isRight ? newBranch : branch,
      );
    }

    // Key belongs inside current node
    if (isRight) {
      return new PendingNodeBranch(branch.path, branch.depth, branch.left, this.buildTree(branch.right, key, data));
    }

    return new PendingNodeBranch(branch.path, branch.depth, this.buildTree(branch.left, key, data), branch.right);
  }
}
