import { PendingLeafBranch } from './PendingLeafBranch.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Finalized leaf in a radix sparse Merkle sum tree. The leaf hash is
 * `SHA-256(0x10 || key || data || u256(value))`, where `u256` is the 32-byte
 * big-endian encoding of the leaf amount.
 */
export class FinalizedLeafBranch {
  public constructor(
    public readonly path: bigint,
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

    // u256(value): 32-byte big-endian, left-padded.
    const value = BigintConverter.encode(leaf.value, 32);

    const hash = await factory
      .create()
      .update(new Uint8Array([0x10]))
      .update(key)
      .update(data)
      .update(value)
      .digest();

    return new FinalizedLeafBranch(leaf.path, key, data, leaf.value, hash);
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
        Value: ${this.value}
        Hash: ${this.hash.toString()}`;
  }
}
