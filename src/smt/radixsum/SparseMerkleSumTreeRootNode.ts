import { FinalizedBranch } from './FinalizedBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../crypto/hash/HashAlgorithm.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Radix sparse Merkle sum tree root node. If the tree holds a single leaf the
 * root hash and sum are that leaf's; otherwise the root is the top internal
 * node, which bifurcates at depth 0.
 */
export class SparseMerkleSumTreeRootNode {
  public readonly depth = 0;
  public readonly path = 1n;

  private constructor(
    public readonly left: FinalizedBranch | null,
    public readonly right: FinalizedBranch | null,
    public readonly value: bigint,
    public readonly hash: DataHash,
  ) {}

  /**
   * Creates a new instance of SumTreeRootNode.
   * @param left Root node left branch.
   * @param right Root node right branch.
   * @param factory Factory to create data hashers.
   * @return A promise that resolves to a new SumTreeRootNode instance.
   * @throws {RangeError} On 256-bit sum overflow.
   */
  public static async create(
    left: FinalizedBranch | null,
    right: FinalizedBranch | null,
    factory: IDataHasherFactory<IDataHasher>,
  ): Promise<SparseMerkleSumTreeRootNode> {
    if (left != null && right == null) {
      return new SparseMerkleSumTreeRootNode(left, null, left.value, left.hash);
    }
    if (left == null && right != null) {
      return new SparseMerkleSumTreeRootNode(null, right, right.value, right.hash);
    }

    if (left != null && right != null) {
      const node = await new PendingNodeBranch(1n, 0, left, right).finalize(factory);
      return new SparseMerkleSumTreeRootNode(node.left, node.right, node.value, node.hash);
    }

    return new SparseMerkleSumTreeRootNode(null, null, 0n, new DataHash(HashAlgorithm.SHA256, new Uint8Array(32)));
  }

  /**
   * Returns a string representation of the SumTreeRootNode.
   */
  public toString(): string {
    return dedent`
      Root:
        Hash: ${this.hash.toString()}
        Value: ${this.value}
      Left:
        ${this.left ? this.left.toString() : 'null'}
      Right:
        ${this.right ? this.right.toString() : 'null'}`;
  }
}
