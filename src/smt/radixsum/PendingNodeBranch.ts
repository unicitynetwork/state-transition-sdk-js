import { FinalizedNodeBranch } from './FinalizedNodeBranch.js';
import { PendingBranch } from './PendingBranch.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { dedent } from '../../util/StringUtils.js';
import { bitsToString } from '../SparseMerkleTreePathUtils.js';

/**
 * Pending interior node in a radix sparse Merkle sum tree, awaiting hashing.
 */
export class PendingNodeBranch {
  public constructor(
    private readonly _path: Uint8Array,
    public readonly depth: number,
    public readonly left: PendingBranch,
    public readonly right: PendingBranch,
  ) {
    this._path = new Uint8Array(_path);
  }

  /**
   * @returns {Uint8Array} Copy of the node's committed region (its `depth`-bit prefix, suffix zeroed).
   */
  public get path(): Uint8Array {
    return this._path.slice();
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
      PendingNode[${bitsToString(this.path, this.depth)}]
        Left: ${this.left.toString()}
        Right: ${this.right.toString()}`;
  }
}
