import { FinalizedBranch } from './FinalizedBranch.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../crypto/hash/HashAlgorithm.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { dedent } from '../../util/StringUtils.js';
import { getBitAtDepth } from '../SparseMerkleTreePathUtils.js';
import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { areUint8ArraysEqual } from '../../util/TypedArrayUtils.js';

/**
 * Sparse Merkle Tree root node implementation.
 */
export class SparseMerkleTreeRootNode {
  public readonly depth = 0;
  public readonly path = 1n;

  private constructor(
    public readonly left: FinalizedBranch | null,
    public readonly right: FinalizedBranch | null,
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
    left: FinalizedBranch | null,
    right: FinalizedBranch | null,
    factory: IDataHasherFactory<IDataHasher>,
  ): Promise<SparseMerkleTreeRootNode> {
    if (left != null && right == null) {
      return new SparseMerkleTreeRootNode(left, null, left.hash);
    }
    if (left == null && right != null) {
      return new SparseMerkleTreeRootNode(null, right, right.hash);
    }

    if (left != null && right != null) {
      return new SparseMerkleTreeRootNode(
        left,
        right,
        await factory
          .create()
          .update(new Uint8Array([0x01, 0x00]))
          .update(left.hash.data)
          .update(right.hash.data)
          .digest(),
      );
    }

    return new SparseMerkleTreeRootNode(null, null, new DataHash(HashAlgorithm.SHA256, new Uint8Array(32)));
  }

  public has(key: Uint8Array): boolean {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: FinalizedBranch | SparseMerkleTreeRootNode | null = this;
    while (node != null) {
      if (node instanceof FinalizedLeafBranch) {
        return areUint8ArraysEqual(node.key, key);
      }

      const isRight = getBitAtDepth(key, node.depth);
      node = isRight ? node.right : node.left;
    }

    return false;
  }

  /**
   * Returns a string representation of the MerkleTreeRootNode.
   */
  public toString(): string {
    return dedent`
      Root: 
        Hash: ${this.hash.toString()}
      Left: 
        ${this.left ? this.left.toString() : 'null'}
      Right: 
        ${this.right ? this.right.toString() : 'null'}`;
  }
}
