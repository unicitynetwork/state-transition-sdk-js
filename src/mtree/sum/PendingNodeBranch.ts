import { NodeBranch } from './NodeBranch.js';
import { PendingBranch } from './PendingBranch.js';
import { IDataHasher } from '../../hash/IDataHasher.js';
import { IDataHasherFactory } from '../../hash/IDataHasherFactory.js';
import { CborEncoder } from '../../serializer/cbor/CborEncoder.js';
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
        CborEncoder.encodeArray([
          CborEncoder.encodeArray([
            CborEncoder.encodeByteString(left.hash.imprint),
            CborEncoder.encodeByteString(BigintConverter.encode(left.sum)),
          ]),
          CborEncoder.encodeArray([
            CborEncoder.encodeByteString(right.hash.imprint),
            CborEncoder.encodeByteString(BigintConverter.encode(right.sum)),
          ]),
        ]),
      )
      .digest();

    const hash = await factory
      .create()
      .update(
        CborEncoder.encodeArray([
          CborEncoder.encodeByteString(BigintConverter.encode(this.path)),
          CborEncoder.encodeByteString(childrenHash.imprint),
          CborEncoder.encodeByteString(BigintConverter.encode(left.sum + right.sum)),
        ]),
      )
      .digest();
    return new NodeBranch(this.path, left, right, left.sum + right.sum, childrenHash, hash);
  }
}
