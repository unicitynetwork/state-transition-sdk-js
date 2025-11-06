import { Branch } from './Branch.js';
import { DataHash } from '../../hash/DataHash.js';
import { dedent } from '../../util/StringUtils.js';

export class NodeBranch {
  public constructor(
    public readonly path: bigint,
    public readonly left: Branch,
    public readonly right: Branch,
    public readonly value: bigint,
    public readonly hash: DataHash,
  ) {}

  public finalize(): Promise<NodeBranch> {
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
