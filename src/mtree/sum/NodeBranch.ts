import { Branch } from './Branch.js';
import { DataHash } from '../../hash/DataHash.js';
import { dedent } from '../../util/StringUtils.js';

export class NodeBranch {
  public constructor(
    public readonly path: bigint,
    public readonly left: Branch,
    public readonly right: Branch,
    public readonly sum: bigint,
    public readonly childrenHash: DataHash,
    public readonly hash: DataHash,
  ) {}

  public finalize(): Promise<NodeBranch> {
    return Promise.resolve(this);
  }

  public toString(): string {
    return dedent`
      Node[${this.path.toString(2)}]
        Children Hash: ${this.childrenHash.toString()}
        Hash: ${this.hash.toString()}
        Sum: ${this.sum}
        Left: ${this.left.toString()}
        Right: ${this.right.toString()}`;
  }
}
