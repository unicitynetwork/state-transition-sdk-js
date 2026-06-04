import { PendingLeafBranch } from './PendingLeafBranch.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Finalized leaf in a radix sparse Merkle tree.
 */
export class FinalizedLeafBranch {
  public constructor(
    public readonly path: bigint,
    private readonly _key: Uint8Array,
    private readonly _data: Uint8Array,
    public readonly hash: DataHash,
  ) {}

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
   * Hash a {@link PendingLeafBranch} into a finalized leaf.
   *
   * @param {IDataHasherFactory<IDataHasher>} factory Hasher factory.
   * @param {PendingLeafBranch} leaf Pending leaf to finalize.
   * @returns {Promise<FinalizedLeafBranch>} Finalized leaf branch.
   */
  public static async fromPendingLeaf(
    factory: IDataHasherFactory<IDataHasher>,
    leaf: PendingLeafBranch,
  ): Promise<FinalizedLeafBranch> {
    const key = leaf.key;
    const data = leaf.data;

    const hash = await factory
      .create()
      .update(new Uint8Array([0x00]))
      .update(key)
      .update(data)
      .digest();

    return new FinalizedLeafBranch(leaf.path, key, data, hash);
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
      FinalizedLeaf[${this.path.toString(2)}]
        Key: ${HexConverter.encode(this._key)}
        Data: ${HexConverter.encode(this._data)}
        Hash: ${this.hash.toString()}`;
  }
}
