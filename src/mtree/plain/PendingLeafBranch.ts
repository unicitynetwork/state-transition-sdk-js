import { LeafBranch } from './LeafBranch.js';
import { IDataHasher } from '../../hash/IDataHasher.js';
import { IDataHasherFactory } from '../../hash/IDataHasherFactory.js';
import { BigintConverter } from '../../util/BigintConverter.js';

export class PendingLeafBranch {
  public constructor(
    public readonly path: bigint,
    public readonly value: Uint8Array,
  ) {}

  public async finalize(factory: IDataHasherFactory<IDataHasher>): Promise<LeafBranch> {
    const hash = await factory.create().update(BigintConverter.encode(this.path)).update(this.value).digest();
    return new LeafBranch(this.path, this.value, hash);
  }
}
