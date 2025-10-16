import { Branch } from './Branch.js';
import { LeafBranch } from './LeafBranch.js';
import { SparseMerkleSumTreePath, SparseMerkleSumTreePathRoot } from './SparseMerkleSumTreePath.js';
import { SparseMerkleSumTreePathStep } from './SparseMerkleSumTreePathStep.js';
import { DataHash } from '../../hash/DataHash.js';
import { IDataHasher } from '../../hash/IDataHasher.js';
import { IDataHasherFactory } from '../../hash/IDataHasherFactory.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { calculateCommonPath } from '../plain/SparseMerkleTreePathUtils.js';

/**
 * Sparse Merkle Sum Tree root node implementation.
 */
export class SparseMerkleSumTreeRootNode {
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
  ): Promise<SparseMerkleSumTreeRootNode> {
    const hash = await factory
      .create()
      .update(
        CborSerializer.encodeArray(
          left
            ? CborSerializer.encodeArray(
                CborSerializer.encodeByteString(left.hash.imprint),
                CborSerializer.encodeByteString(BigintConverter.encode(left.sum)),
              )
            : CborSerializer.encodeNull(),
          right
            ? CborSerializer.encodeArray(
                CborSerializer.encodeByteString(right.hash.imprint),
                CborSerializer.encodeByteString(BigintConverter.encode(right.sum)),
              )
            : CborSerializer.encodeNull(),
        ),
      )
      .digest();

    return new SparseMerkleSumTreeRootNode(left ?? null, right ?? null, (left?.sum ?? 0n) + (right?.sum ?? 0n), hash);
  }

  private static generatePath(
    remainingPath: bigint,
    left: Branch | null,
    right: Branch | null,
  ): ReadonlyArray<SparseMerkleSumTreePathStep> {
    const isRight = remainingPath & 1n;
    const branch = isRight ? right : left;
    const siblingBranch = isRight ? left : right;

    if (branch === null) {
      return [SparseMerkleSumTreePathStep.createWithoutBranch(remainingPath, siblingBranch)];
    }

    const commonPath = calculateCommonPath(remainingPath, branch.path);

    if (branch.path === commonPath.path) {
      if (branch instanceof LeafBranch) {
        return [SparseMerkleSumTreePathStep.create(branch.path, branch, siblingBranch)];
      }

      // If path has ended, return the current non leaf branch data
      if (remainingPath >> commonPath.length === 1n) {
        return [SparseMerkleSumTreePathStep.create(branch.path, branch, siblingBranch)];
      }

      return [
        ...this.generatePath(remainingPath >> commonPath.length, branch.left, branch.right),
        SparseMerkleSumTreePathStep.create(branch.path, null, siblingBranch),
      ];
    }

    return [SparseMerkleSumTreePathStep.create(branch.path, branch, siblingBranch)];
  }

  /**
   * Generates a merkle tree traversal path.
   * @param path The path to create the MerkleSumTreePath for.
   * @returns A MerkleSumTreePath for the given path.
   */
  public getPath(path: bigint): SparseMerkleSumTreePath {
    return new SparseMerkleSumTreePath(
      new SparseMerkleSumTreePathRoot(this.hash, this.sum),
      SparseMerkleSumTreeRootNode.generatePath(path, this.left, this.right),
    );
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
