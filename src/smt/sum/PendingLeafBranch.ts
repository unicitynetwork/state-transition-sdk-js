import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';

export class PendingLeafBranch {
  public constructor(
    public readonly path: bigint,
    private readonly _data: Uint8Array,
    public readonly value: bigint,
  ) {
    this._data = new Uint8Array(_data);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public async finalize(factory: IDataHasherFactory<IDataHasher>): Promise<FinalizedLeafBranch> {
    const hash = await factory
      .create()
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
          CborSerializer.encodeByteString(this._data),
          CborSerializer.encodeByteString(BigintConverter.encode(this.value)),
        ),
      )
      .digest();

    return new FinalizedLeafBranch(this.path, this._data, this.value, hash);
  }
}
