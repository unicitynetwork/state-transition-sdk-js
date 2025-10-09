import { Branch } from './Branch.js';
import { LeafBranch } from './LeafBranch.js';
import { MerkleTreePath } from './MerkleTreePath.js';
import { MerkleTreePathStep } from './MerkleTreePathStep.js';
import { calculateCommonPath } from './SparseMerkleTreePathUtils.js';
import { DataHash } from '../../hash/DataHash.js';
import { IDataHasher } from '../../hash/IDataHasher.js';
import { IDataHasherFactory } from '../../hash/IDataHasherFactory.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Sparse Merkle Tree root node implementation.
 */
export class MerkleTreeRootNode {
  public readonly path = 1n;

  private constructor(
    public readonly left: Branch | null,
    public readonly right: Branch | null,
    public readonly hash: DataHash,
  ) {}

  /**
   * Creates a new instance of MerkleTreeRootNode.
   * @param left Root node left branch.
   * @param right Root node right branch.
   * @param factory Factory to create data hashers.
   * @return A promise that resolves to a new MerkleTreeRootNode instance.
   */
  public static async create(
    left: Branch | null,
    right: Branch | null,
    factory: IDataHasherFactory<IDataHasher>,
  ): Promise<MerkleTreeRootNode> {
    const hash = await factory
      .create()
      .update(left?.hash.data ?? new Uint8Array(1))
      .update(right?.hash.data ?? new Uint8Array(1))
      .digest();

    return new MerkleTreeRootNode(left ?? null, right ?? null, hash);
  }

  private static generatePath(
    remainingPath: bigint,
    left: Branch | null,
    right: Branch | null,
  ): ReadonlyArray<MerkleTreePathStep> {
    const isRight = remainingPath & 1n;
    const branch = isRight ? right : left;
    const siblingBranch = isRight ? left : right;

    if (branch === null) {
      return [MerkleTreePathStep.createWithoutBranch(remainingPath, siblingBranch)];
    }

    const commonPath = calculateCommonPath(remainingPath, branch.path);

    if (branch.path === commonPath.path) {
      if (branch instanceof LeafBranch) {
        return [MerkleTreePathStep.create(branch.path, branch, siblingBranch)];
      }

      // If path has ended, return the current non leaf branch data
      if (remainingPath >> commonPath.length === 1n) {
        return [MerkleTreePathStep.create(branch.path, branch, siblingBranch)];
      }

      return [
        ...this.generatePath(remainingPath >> commonPath.length, branch.left, branch.right),
        MerkleTreePathStep.create(branch.path, null, siblingBranch),
      ];
    }

    return [MerkleTreePathStep.create(branch.path, branch, siblingBranch)];
  }

  /**
   * Generates a merkle tree traversal path.
   * @param path The path for which to generate the Merkle tree path.
   * @returns A MerkleTreePath instance representing the path in the tree.
   */
  public getPath(path: bigint): MerkleTreePath {
    return new MerkleTreePath(this.hash, MerkleTreeRootNode.generatePath(path, this.left, this.right));
  }

  /**
   * Returns a string representation of the MerkleTreeRootNode.
   */
  public toString(): string {
    return dedent`
      Left: 
        ${this.left ? this.left.toString() : 'null'}
      Right: 
        ${this.right ? this.right.toString() : 'null'}`;
  }
}
