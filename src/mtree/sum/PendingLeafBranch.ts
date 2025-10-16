import { LeafBranch } from './LeafBranch.js';
import { IDataHasher } from '../../hash/IDataHasher.js';
import { IDataHasherFactory } from '../../hash/IDataHasherFactory.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';

export class PendingLeafBranch {
  public constructor(
    public readonly path: bigint,
    private readonly _value: Uint8Array,
    public readonly sum: bigint,
  ) {}

  public get value(): Uint8Array {
    return new Uint8Array(this._value);
  }

  public async finalize(factory: IDataHasherFactory<IDataHasher>): Promise<LeafBranch> {
    const hash = await factory
      .create()
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
          CborSerializer.encodeByteString(this.value),
          CborSerializer.encodeByteString(BigintConverter.encode(this.sum)),
        ),
      )
      .digest();
    return new LeafBranch(this.path, this.value, this.sum, hash);
  }
}
