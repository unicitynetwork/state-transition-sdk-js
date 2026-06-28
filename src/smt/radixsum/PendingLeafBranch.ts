import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Pending leaf in a radix sparse Merkle sum tree, awaiting hashing.
 */
export class PendingLeafBranch {
  public constructor(
    public readonly path: bigint,
    private readonly _key: Uint8Array,
    private readonly _data: Uint8Array,
    public readonly value: bigint,
  ) {
    this._key = new Uint8Array(_key);
    this._data = new Uint8Array(_data);
  }

  /**
   * @returns {Uint8Array} Copy of the leaf data bytes.
   */
  public get data(): Uint8Array {
    return this._data.slice();
  }

  /**
   * @returns {Uint8Array} Copy of the leaf key bytes.
   */
  public get key(): Uint8Array {
    return this._key.slice();
  }

  /**
   * Hash this leaf to produce a finalized branch.
   *
   * @param {IDataHasherFactory<IDataHasher>} factory Hasher factory.
   * @returns {Promise<FinalizedLeafBranch>} Finalized leaf branch.
   */
  public finalize(factory: IDataHasherFactory<IDataHasher>): Promise<FinalizedLeafBranch> {
    return FinalizedLeafBranch.fromPendingLeaf(factory, this);
  }

  /**
   * @returns {string} String representation of the leaf.
   */
  public toString(): string {
    return dedent`
      PendingLeaf[${this.path.toString(2)}]
        Key: ${HexConverter.encode(this._key)}
        Data: ${HexConverter.encode(this._data)}
        Value: ${this.value}`;
  }
}
