import { FinalizedBranch } from './FinalizedBranch.js';
import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../crypto/hash/HashAlgorithm.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { BitString } from '../../util/BitString.js';
import { dedent } from '../../util/StringUtils.js';
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
      const node = await new PendingNodeBranch(1n, 0, left, right).finalize(factory);
      return new SparseMerkleTreeRootNode(node.left, node.right, node.hash);
    }

    return new SparseMerkleTreeRootNode(null, null, new DataHash(HashAlgorithm.SHA256, new Uint8Array(32)));
  }

  /**
   * Check whether a leaf with the given key is in the tree.
   *
   * @param {Uint8Array} key Leaf key.
   * @returns {boolean} True if the key is present.
   */
  public has(key: Uint8Array): boolean {
    const keyPath = BitString.fromBytesReversedLSB(key).toBigInt();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: FinalizedBranch | SparseMerkleTreeRootNode | null = this;
    while (node != null) {
      if (node instanceof FinalizedLeafBranch) {
        return areUint8ArraysEqual(node.key, key);
      }

      const isRight: bigint = (keyPath >> BigInt(node.depth)) & 1n;
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
