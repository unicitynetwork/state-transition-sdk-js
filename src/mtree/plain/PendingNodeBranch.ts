import { NodeBranch } from './NodeBranch.js';
import { PendingBranch } from './PendingBranch.js';
import { IDataHasher } from '../../hash/IDataHasher.js';
import { IDataHasherFactory } from '../../hash/IDataHasherFactory.js';
import { BigintConverter } from '../../util/BigintConverter.js';

export class PendingNodeBranch {
  public constructor(
    public readonly path: bigint,
    public readonly left: PendingBranch,
    public readonly right: PendingBranch,
  ) {}

  public async finalize(factory: IDataHasherFactory<IDataHasher>): Promise<NodeBranch> {
    const [left, right] = await Promise.all([this.left.finalize(factory), this.right.finalize(factory)]);
    const childrenHash = await factory.create().update(left.hash.data).update(right.hash.data).digest();
    const hash = await factory.create().update(BigintConverter.encode(this.path)).update(childrenHash.data).digest();
    return new NodeBranch(this.path, left, right, childrenHash, hash);
  }
}
