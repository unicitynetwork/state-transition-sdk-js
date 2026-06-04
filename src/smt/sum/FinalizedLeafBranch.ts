import { DataHash } from '../../crypto/hash/DataHash.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Finalized leaf in a sparse Merkle sum tree.
 */
export class FinalizedLeafBranch {
  public constructor(
    public readonly path: bigint,
    private readonly _data: Uint8Array,
    public readonly value: bigint,
    public readonly hash: DataHash,
  ) {
    this._data = new Uint8Array(_data);
  }

  /**
   * @returns {Uint8Array} Copy of the leaf data bytes.
   */
  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  /**
   * @returns {Promise<FinalizedLeafBranch>} This branch (already finalized).
   */
  public finalize(): Promise<FinalizedLeafBranch> {
    return Promise.resolve(this);
  }

  /**
   * @returns {string} String representation of the leaf.
   */
  public toString(): string {
    return dedent`
      Leaf[${this.path.toString(2)}]
        Hash: ${this.hash.toString()}
        Data: ${HexConverter.encode(this._data)}
        Sum: ${this.value}`;
  }
}
