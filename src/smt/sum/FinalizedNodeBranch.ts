import { FinalizedBranch } from './FinalizedBranch.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { dedent } from '../../util/StringUtils.js';

export class FinalizedNodeBranch {
  public constructor(
    public readonly path: bigint,
    public readonly left: FinalizedBranch,
    public readonly right: FinalizedBranch,
    public readonly value: bigint,
    public readonly hash: DataHash,
  ) {}

  public finalize(): Promise<FinalizedNodeBranch> {
    return Promise.resolve(this);
  }

  public toString(): string {
    return dedent`
      Node[${this.path.toString(2)}]
        Hash: ${this.hash.toString()}
        Value: ${this.value}
        Left: ${this.left.toString()}
        Right: ${this.right.toString()}`;
  }
}
