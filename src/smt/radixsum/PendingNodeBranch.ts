import { FinalizedNodeBranch } from './FinalizedNodeBranch.js';
import { PendingBranch } from './PendingBranch.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { dedent } from '../../util/StringUtils.js';
import { bitsToString, commonPrefixLength } from '../SparseMerkleTreePathUtils.js';

/**
 * Pending interior node in a radix sparse Merkle sum tree, awaiting hashing.
 */
export class PendingNodeBranch {
  private constructor(
    private readonly _path: Uint8Array,
    public readonly depth: number,
    public readonly left: PendingBranch,
    public readonly right: PendingBranch,
  ) {}

  /**
   * @returns {Uint8Array} Copy of the node's committed region (its `depth`-bit prefix, suffix zeroed).
   */
  public get path(): Uint8Array {
    return this._path.slice();
  }

  /**
   * Create a pending node, defensively copying the committed region.
   *
   * @param {Uint8Array} path Committed region (its `depth`-bit prefix, suffix zeroed).
   * @param {number} depth Node depth.
   * @param {PendingBranch} left Left child.
   * @param {PendingBranch} right Right child.
   * @returns {PendingNodeBranch} New pending node.
   */
  public static create(path: Uint8Array, depth: number, left: PendingBranch, right: PendingBranch): PendingNodeBranch {
    return new PendingNodeBranch(new Uint8Array(path), depth, left, right);
  }

  /**
   * Depth at which `key` diverges from this node's committed region, capped at the node's own depth.
   *
   * @param {Uint8Array} key Key being inserted.
   * @returns {number} Common-prefix depth.
   */
  public calculateSplitDepth(key: Uint8Array): number {
    return commonPrefixLength(key, this._path, this.depth);
  }

  /**
   * Hash this node (after finalizing children).
   *
   * @param {IDataHasherFactory<IDataHasher>} factory Hasher factory.
   * @returns {Promise<FinalizedNodeBranch>} Finalized node branch.
   */
  public finalize(factory: IDataHasherFactory<IDataHasher>): Promise<FinalizedNodeBranch> {
    return FinalizedNodeBranch.create(factory, this);
  }

  /**
   * @returns {string} String representation of the node.
   */
  public toString(): string {
    return dedent`
      PendingNode[${bitsToString(this._path, this.depth)}]
        Left: ${this.left.toString()}
        Right: ${this.right.toString()}`;
  }

  /**
   * Derive a node with `left` as its left child, reusing this node's committed region without copying it.
   *
   * @param {PendingBranch} left Replacement left child.
   * @returns {PendingNodeBranch} New pending node.
   */
  public withLeftBranch(left: PendingBranch): PendingNodeBranch {
    return new PendingNodeBranch(this._path, this.depth, left, this.right);
  }

  /**
   * Derive a node with `right` as its right child, reusing this node's committed region without copying it.
   *
   * @param {PendingBranch} right Replacement right child.
   * @returns {PendingNodeBranch} New pending node.
   */
  public withRightBranch(right: PendingBranch): PendingNodeBranch {
    return new PendingNodeBranch(this._path, this.depth, this.left, right);
  }
}
