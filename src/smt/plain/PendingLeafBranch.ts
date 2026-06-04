import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';

/**
 * Pending leaf in a plain sparse Merkle tree, awaiting hashing.
 */
export class PendingLeafBranch {
  public constructor(
    public readonly path: bigint,
    private readonly _data: Uint8Array,
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
   * Hash this leaf to produce a finalized branch.
   *
   * @param {IDataHasherFactory<IDataHasher>} factory Hasher factory.
   * @returns {Promise<FinalizedLeafBranch>} Finalized leaf branch.
   */
  public async finalize(factory: IDataHasherFactory<IDataHasher>): Promise<FinalizedLeafBranch> {
    const hash = await factory
      .create()
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
          CborSerializer.encodeByteString(this._data),
        ),
      )
      .digest();
    return new FinalizedLeafBranch(this.path, this._data, hash);
  }
}
