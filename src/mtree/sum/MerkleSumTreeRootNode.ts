import { Branch } from './Branch.js';
import { LeafBranch } from './LeafBranch.js';
import { MerkleSumTreePath } from './MerkleSumTreePath.js';
import { MerkleSumTreePathStep } from './MerkleSumTreePathStep.js';
import { DataHash } from '../../hash/DataHash.js';
import { IDataHasher } from '../../hash/IDataHasher.js';
import { IDataHasherFactory } from '../../hash/IDataHasherFactory.js';
import { CborEncoder } from '../../serializer/cbor/CborEncoder.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { calculateCommonPath } from '../plain/SparseMerkleTreePathUtils.js';

/**
 * Sparse Merkle Sum Tree root node implementation.
 */
export class MerkleSumTreeRootNode {
  public readonly path = 1n;

  private constructor(
    public readonly left: Branch | null,
    public readonly right: Branch | null,
    public readonly sum: bigint,
    public readonly hash: DataHash,
  ) {}

  /**
   * Creates a new instance of MerkleSumTreeRootNode.
   * @param left Root node left branch.
   * @param right Root node right branch.
   * @param factory Factory to create data hashers.
   * @return A promise that resolves to a new MerkleSumTreeRootNode instance.
   */
  public static async create(
    left: Branch | null,
    right: Branch | null,
    factory: IDataHasherFactory<IDataHasher>,
  ): Promise<MerkleSumTreeRootNode> {
    const hash = await factory
      .create()
      .update(
        CborEncoder.encodeArray([
          left
            ? CborEncoder.encodeArray([
                CborEncoder.encodeByteString(left.hash.imprint),
                CborEncoder.encodeByteString(BigintConverter.encode(left.sum)),
              ])
            : CborEncoder.encodeNull(),
          right
            ? CborEncoder.encodeArray([
                CborEncoder.encodeByteString(right.hash.imprint),
                CborEncoder.encodeByteString(BigintConverter.encode(right.sum)),
              ])
            : CborEncoder.encodeNull(),
        ]),
      )
      .digest();

    return new MerkleSumTreeRootNode(left ?? null, right ?? null, (left?.sum ?? 0n) + (right?.sum ?? 0n), hash);
  }

  private static generatePath(
    remainingPath: bigint,
    left: Branch | null,
    right: Branch | null,
  ): ReadonlyArray<MerkleSumTreePathStep> {
    const isRight = remainingPath & 1n;
    const branch = isRight ? right : left;
    const siblingBranch = isRight ? left : right;

    if (branch === null) {
      return [MerkleSumTreePathStep.createWithoutBranch(remainingPath, siblingBranch)];
    }

    const commonPath = calculateCommonPath(remainingPath, branch.path);

    if (branch.path === commonPath.path) {
      if (branch instanceof LeafBranch) {
        return [MerkleSumTreePathStep.create(branch.path, branch, siblingBranch)];
      }

      // If path has ended, return the current non leaf branch data
      if (remainingPath >> commonPath.length === 1n) {
        return [MerkleSumTreePathStep.create(branch.path, branch, siblingBranch)];
      }

      return [
        ...this.generatePath(remainingPath >> commonPath.length, branch.left, branch.right),
        MerkleSumTreePathStep.create(branch.path, null, siblingBranch),
      ];
    }

    return [MerkleSumTreePathStep.create(branch.path, branch, siblingBranch)];
  }

  /**
   * Generates a merkle tree traversal path.
   * @param path The path to create the MerkleSumTreePath for.
   * @returns A MerkleSumTreePath for the given path.
   */
  public getPath(path: bigint): MerkleSumTreePath {
    return new MerkleSumTreePath(this.hash, this.sum, MerkleSumTreeRootNode.generatePath(path, this.left, this.right));
  }

  /**
   * Returns a string representation of the MerkleSumTreeRootNode.
   */
  public toString(): string {
    return dedent`
      Left: 
        ${this.left ? this.left.toString() : 'null'}
      Right: 
        ${this.right ? this.right.toString() : 'null'}`;
  }
}
