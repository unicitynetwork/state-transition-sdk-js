import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

export class PendingLeafBranch {
  public constructor(
    public readonly path: bigint,
    private readonly _key: Uint8Array,
    private readonly _data: Uint8Array,
  ) {
    this._key = new Uint8Array(_key);
    this._data = new Uint8Array(_data);
  }

  public get data(): Uint8Array {
    return this._data.slice();
  }

  public get key(): Uint8Array {
    return this._key.slice();
  }

  public finalize(factory: IDataHasherFactory<IDataHasher>): Promise<FinalizedLeafBranch> {
    return FinalizedLeafBranch.fromPendingLeaf(factory, this);
  }

  public toString(): string {
    return dedent`
      PendingLeaf[${this.path.toString(2)}]
        Key: ${HexConverter.encode(this._key)}
        Data: ${HexConverter.encode(this._data)}`;
  }
}
