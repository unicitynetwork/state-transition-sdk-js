import { FinalizedBranch } from './FinalizedBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Finalized interior node in a radix sparse Merkle tree.
 */
export class FinalizedNodeBranch {
  public constructor(
    public readonly path: bigint,
    public readonly depth: number,
    public readonly left: FinalizedBranch,
    public readonly right: FinalizedBranch,
    public readonly hash: DataHash,
  ) {}

  /**
   * Hash a {@link PendingNodeBranch} into a finalized node.
   *
   * @param {IDataHasherFactory<IDataHasher>} factory Hasher factory.
   * @param {PendingNodeBranch} node Pending node to finalize.
   * @returns {Promise<FinalizedNodeBranch>} Finalized node branch.
   */
  public static async create(
    factory: IDataHasherFactory<IDataHasher>,
    node: PendingNodeBranch,
  ): Promise<FinalizedNodeBranch> {
    const [left, right] = await Promise.all([node.left.finalize(factory), node.right.finalize(factory)]);
    const hash = await factory
      .create()
      .update(new Uint8Array([0x01, node.depth]))
      .update(left.hash.data)
      .update(right.hash.data)
      .digest();

    return new FinalizedNodeBranch(node.path, node.depth, left, right, hash);
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
      Node[${this.path.toString(2)}]
        Hash: ${this.hash.toString()}
        Depth: ${this.depth}
        Left: ${this.left.toString()}
        Right: ${this.right.toString()}`;
  }
}
