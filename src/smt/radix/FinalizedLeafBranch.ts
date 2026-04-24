import { PendingLeafBranch } from './PendingLeafBranch.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

export class FinalizedLeafBranch {
  public constructor(
    public readonly path: bigint,
    private readonly _key: Uint8Array,
    private readonly _data: Uint8Array,
    public readonly hash: DataHash,
  ) {}

  public get data(): Uint8Array {
    return this._data.slice();
  }

  public get key(): Uint8Array {
    return this._key.slice();
  }

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

  public finalize(): Promise<FinalizedLeafBranch> {
    return Promise.resolve(this);
  }

  public toString(): string {
    return dedent`
      FinalizedLeaf[${this.path.toString(2)}]
        Key: ${HexConverter.encode(this._key)}
        Data: ${HexConverter.encode(this._data)}
        Hash: ${this.hash.toString()}`;
  }
}
