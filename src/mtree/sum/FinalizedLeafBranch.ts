import { DataHash } from '../../hash/DataHash.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

export class FinalizedLeafBranch {
  public constructor(
    public readonly path: bigint,
    private readonly _data: Uint8Array,
    public readonly value: bigint,
    public readonly hash: DataHash,
  ) {
    this._data = new Uint8Array(_data);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public finalize(): Promise<FinalizedLeafBranch> {
    return Promise.resolve(this);
  }

  public toString(): string {
    return dedent`
      Leaf[${this.path.toString(2)}]
        Hash: ${this.hash.toString()}
        Data: ${HexConverter.encode(this._data)}
        Sum: ${this.value}`;
  }
}
