import { FinalizedBranch } from './FinalizedBranch.js';
import { PendingBranch } from './PendingBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { bitsToString, commonPrefixLength } from '../SparseMerkleTreePathUtils.js';

/**
 * Finalized interior node in a radix sparse Merkle sum tree. The node hash is
 * `SHA-256(0x11 || u8(depth) || hL || u256(vL) || hR || u256(vR))` and the node
 * sum is `vL + vR`, computed with a checked 256-bit addition.
 */
export class FinalizedNodeBranch {
  private constructor(
    private readonly _path: Uint8Array,
    public readonly depth: number,
    public readonly left: FinalizedBranch,
    public readonly right: FinalizedBranch,
    public readonly value: bigint,
    public readonly hash: DataHash,
  ) {}

  /**
   * @returns {Uint8Array} Copy of the node's committed region (its `depth`-bit prefix, suffix zeroed).
   */
  public get path(): Uint8Array {
    return this._path.slice();
  }

  /**
   * Hash a {@link PendingNodeBranch} into a finalized node.
   *
   * @param {IDataHasherFactory<IDataHasher>} factory Hasher factory.
   * @param {PendingNodeBranch} node Pending node to finalize.
   * @returns {Promise<FinalizedNodeBranch>} Finalized node branch.
   * @throws {RangeError} On 256-bit sum overflow.
   */
  public static async create(
    factory: IDataHasherFactory<IDataHasher>,
    node: PendingNodeBranch,
  ): Promise<FinalizedNodeBranch> {
    const [left, right] = await Promise.all([node.left.finalize(factory), node.right.finalize(factory)]);
    const value = left.value + right.value;
    if (value >= 1n << 256n) {
      throw new RangeError('RSMST internal sum overflow.');
    }

    // u256(value): 32-byte big-endian, left-padded.
    const leftValue = BigintConverter.encode(left.value, 32);
    const rightValue = BigintConverter.encode(right.value, 32);

    const hash = await factory
      .create()
      .update(new Uint8Array([0x11, node.depth]))
      .update(left.hash.data)
      .update(leftValue)
      .update(right.hash.data)
      .update(rightValue)
      .digest();

    return new FinalizedNodeBranch(node.path, node.depth, left, right, value, hash);
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
   * @returns {Promise<FinalizedNodeBranch>} This branch (already finalized).
   */
  public finalize(): Promise<FinalizedNodeBranch> {
    return Promise.resolve(this);
  }

  /**
   * @returns {string} String representation of the node.
   */
  public toString(): string {
    return dedent`
      Node[${bitsToString(this.path, this.depth)}]
        Hash: ${this.hash.toString()}
        Depth: ${this.depth}
        Value: ${this.value}
        Left: ${this.left.toString()}
        Right: ${this.right.toString()}`;
  }

  /**
   * Derive a pending node with `left` as its left child, reusing this node's committed region.
   *
   * @param {PendingBranch} left Replacement left child.
   * @returns {PendingNodeBranch} New pending node.
   */
  public withLeftBranch(left: PendingBranch): PendingNodeBranch {
    return PendingNodeBranch.create(this._path, this.depth, left, this.right);
  }

  /**
   * Derive a pending node with `right` as its right child, reusing this node's committed region.
   *
   * @param {PendingBranch} right Replacement right child.
   * @returns {PendingNodeBranch} New pending node.
   */
  public withRightBranch(right: PendingBranch): PendingNodeBranch {
    return PendingNodeBranch.create(this._path, this.depth, this.left, right);
  }
}
