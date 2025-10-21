import { NodeBranch } from './NodeBranch.js';
import { PendingBranch } from './PendingBranch.js';
import { IDataHasher } from '../../hash/IDataHasher.js';
import { IDataHasherFactory } from '../../hash/IDataHasherFactory.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';

export class PendingNodeBranch {
  public constructor(
    public readonly path: bigint,
    public readonly left: PendingBranch,
    public readonly right: PendingBranch,
  ) {}

  public async finalize(factory: IDataHasherFactory<IDataHasher>): Promise<NodeBranch> {
    const [left, right] = await Promise.all([this.left.finalize(factory), this.right.finalize(factory)]);
    const childrenHash = await factory
      .create()
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(left.hash.imprint),
            CborSerializer.encodeByteString(BigintConverter.encode(left.sum)),
          ),
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(right.hash.imprint),
            CborSerializer.encodeByteString(BigintConverter.encode(right.sum)),
          ),
        ),
      )
      .digest();

    const hash = await factory
      .create()
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
          CborSerializer.encodeByteString(childrenHash.imprint),
          CborSerializer.encodeByteString(BigintConverter.encode(left.sum + right.sum)),
        ),
      )
      .digest();
    return new NodeBranch(this.path, left, right, left.sum + right.sum, childrenHash, hash);
  }
}
