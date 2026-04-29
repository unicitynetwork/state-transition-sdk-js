import { FinalizedBranch } from './FinalizedBranch.js';
import { PendingNodeBranch } from './PendingNodeBranch.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { dedent } from '../../util/StringUtils.js';

export class FinalizedNodeBranch {
  public constructor(
    public readonly path: bigint,
    public readonly depth: number,
    public readonly left: FinalizedBranch,
    public readonly right: FinalizedBranch,
    public readonly hash: DataHash,
  ) {}

  public static async create(
    factory: IDataHasherFactory<IDataHasher>,
    node: PendingNodeBranch,
  ): Promise<FinalizedNodeBranch> {
    const [left, right] = await Promise.all([node.left.finalize(factory), node.right.finalize(factory)]);
    const hash = await factory
      .create()
      .update(new Uint8Array([0x01, node.depth]))
      .update(left.hash.data)
      .update(right.hash.data)
      .digest();

    return new FinalizedNodeBranch(node.path, node.depth, left, right, hash);
  }

  public finalize(): Promise<FinalizedNodeBranch> {
    return Promise.resolve(this);
  }

  public toString(): string {
    return dedent`
      Node[${this.path.toString(2)}]
        Hash: ${this.hash.toString()}
        Depth: ${this.depth}
        Left: ${this.left.toString()}
        Right: ${this.right.toString()}`;
  }
}
