import { PendingLeafBranch } from './PendingLeafBranch.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { bitsToString } from '../SparseMerkleTreePathUtils.js';

/**
 * Finalized leaf in a radix sparse Merkle sum tree. The leaf hash is
 * `SHA-256(0x10 || key || data || u256(value))`, where `u256` is the 32-byte
 * big-endian encoding of the leaf amount.
 */
export class FinalizedLeafBranch {
  private constructor(
    private readonly _key: Uint8Array,
    private readonly _data: Uint8Array,
    public readonly value: bigint,
    public readonly hash: DataHash,
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

    const value = BigintConverter.encode(leaf.value, 32);

    const hash = await factory
      .create()
      .update(new Uint8Array([0x10]))
      .update(key)
      .update(data)
      .update(value)
      .digest();

    return new FinalizedLeafBranch(key, data, leaf.value, hash);
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
      FinalizedLeaf[${bitsToString(this._key, this._key.length * 8)}]
        Key: ${HexConverter.encode(this._key)}
        Data: ${HexConverter.encode(this._data)}
        Value: ${this.value}
        Hash: ${this.hash.toString()}`;
  }
}
