import { FinalizedNodeBranch } from './FinalizedNodeBranch.js';
import { PendingBranch } from './PendingBranch.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';

/**
 * Pending interior node in a sparse Merkle sum tree, awaiting hashing.
 */
export class PendingNodeBranch {
  public constructor(
    public readonly path: bigint,
    public readonly left: PendingBranch,
    public readonly right: PendingBranch,
  ) {}

  /**
   * Hash this node (after finalizing children) and sum their values.
   *
   * @param {IDataHasherFactory<IDataHasher>} factory Hasher factory.
   * @returns {Promise<FinalizedNodeBranch>} Finalized node branch.
   */
  public async finalize(factory: IDataHasherFactory<IDataHasher>): Promise<FinalizedNodeBranch> {
    const [left, right] = await Promise.all([this.left.finalize(factory), this.right.finalize(factory)]);

    const hash = await factory
      .create()
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
          CborSerializer.encodeByteString(left.hash.data),
          CborSerializer.encodeByteString(BigintConverter.encode(left.value)),
          CborSerializer.encodeByteString(right.hash.data),
          CborSerializer.encodeByteString(BigintConverter.encode(right.value)),
        ),
      )
      .digest();

    return new FinalizedNodeBranch(this.path, left, right, left.value + right.value, hash);
  }
}
