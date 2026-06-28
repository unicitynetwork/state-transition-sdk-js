import { FinalizedNodeBranch } from './FinalizedNodeBranch.js';
import { PendingBranch } from './PendingBranch.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Pending interior node in a radix sparse Merkle sum tree, awaiting hashing.
 */
export class PendingNodeBranch {
  public constructor(
    public readonly path: bigint,
    public readonly depth: number,
    public readonly left: PendingBranch,
    public readonly right: PendingBranch,
  ) {}

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
      PendingNode[${this.path.toString(2)}]
        Left: ${this.left.toString()}
        Right: ${this.right.toString()}`;
  }
}
