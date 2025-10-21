import { DataHash } from '../../hash/DataHash.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

export class LeafBranch {
  public constructor(
    public readonly path: bigint,
    private readonly _value: Uint8Array,
    public readonly sum: bigint,
    public readonly hash: DataHash,
  ) {}

  public get value(): Uint8Array {
    return new Uint8Array(this._value);
  }

  public finalize(): Promise<LeafBranch> {
    return Promise.resolve(this);
  }

  public toString(): string {
    return dedent`
      Leaf[${this.path.toString(2)}]
        Hash: ${this.hash.toString()}
        Value: ${HexConverter.encode(this._value)}
        Sum: ${this.sum}`;
  }
}
