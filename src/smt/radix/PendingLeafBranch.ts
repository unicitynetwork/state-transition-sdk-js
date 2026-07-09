import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { bitsToString } from '../SparseMerkleTreePathUtils.js';

/**
 * Pending leaf in a radix sparse Merkle tree, awaiting hashing.
 */
export class PendingLeafBranch {
  public constructor(
    private readonly _key: Uint8Array,
    private readonly _data: Uint8Array,
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
   * Routing key: the leaf's own key, read bit-by-bit during tree construction.
   *
   * @returns {Uint8Array} Copy of the routing key.
   */
  public get path(): Uint8Array {
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
      PendingLeaf[${bitsToString(this._key, this._key.length * 8)}]
        Key: ${HexConverter.encode(this._key)}
        Data: ${HexConverter.encode(this._data)}`;
  }
}
