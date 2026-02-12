import { FinalizedBranch } from './FinalizedBranch.js';
import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { SparseMerkleSumTreePath } from './SparseMerkleSumTreePath.js';
import { SparseMerkleSumTreePathStep } from './SparseMerkleSumTreePathStep.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { IDataHasher } from '../../crypto/hash/IDataHasher.js';
import { IDataHasherFactory } from '../../crypto/hash/IDataHasherFactory.js';
import { BigintConverter } from '../../serialization/BigintConverter.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { dedent } from '../../util/StringUtils.js';
import { calculateCommonPath } from '../SparseMerkleTreePathUtils.js';

/**
 * Sparse Merkle Sum Tree root node implementation.
 */
export class SparseMerkleSumTreeRootNode {
  public readonly path = 1n;

  private constructor(
    public readonly left: FinalizedBranch | null,
    public readonly right: FinalizedBranch | null,
    public readonly value: bigint,
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
    left: FinalizedBranch | null,
    right: FinalizedBranch | null,
    factory: IDataHasherFactory<IDataHasher>,
  ): Promise<SparseMerkleSumTreeRootNode> {
    const hash = await factory
      .create()
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(BigintConverter.encode(1n)),
          CborSerializer.encodeNullable(left?.hash.data, CborSerializer.encodeByteString),
          CborSerializer.encodeByteString(BigintConverter.encode(left?.value ?? 0n)),
          CborSerializer.encodeNullable(right?.hash.data, CborSerializer.encodeByteString),
          CborSerializer.encodeByteString(BigintConverter.encode(right?.value ?? 0n)),
        ),
      )
      .digest();

    return new SparseMerkleSumTreeRootNode(
      left ?? null,
      right ?? null,
      (left?.value ?? 0n) + (right?.value ?? 0n),
      hash,
    );
  }

  private static generatePath(
    remainingPath: bigint,
    parent: FinalizedBranch | SparseMerkleSumTreeRootNode,
  ): ReadonlyArray<SparseMerkleSumTreePathStep> {
    if (parent instanceof FinalizedLeafBranch) {
      return [new SparseMerkleSumTreePathStep(parent.path, parent.data, parent.value)];
    }

    const commonPath = calculateCommonPath(remainingPath, parent.path);
    remainingPath = remainingPath >> commonPath.length;

    if (commonPath.path !== parent.path || remainingPath === 1n) {
      return [
        new SparseMerkleSumTreePathStep(0n, parent.left?.hash.data ?? null, parent.left?.value ?? 0n),
        new SparseMerkleSumTreePathStep(parent.path, parent.right?.hash.data ?? null, parent.right?.value ?? 0n),
      ];
    }

    const isRight = remainingPath & 1n;
    const branch = isRight ? parent.right : parent.left;
    const siblingBranch = isRight ? parent.left : parent.right;

    const step = new SparseMerkleSumTreePathStep(
      parent.path,
      siblingBranch?.hash.data ?? null,
      siblingBranch?.value ?? 0n,
    );
    if (branch === null) {
      return [new SparseMerkleSumTreePathStep(isRight, null, 0n), step];
    }

    return [...this.generatePath(remainingPath, branch), step];
  }

  /**
   * Generates a merkle tree traversal path.
   * @param path The path to create the MerkleSumTreePath for.
   * @returns A MerkleSumTreePath for the given path.
   */
  public getPath(path: bigint): SparseMerkleSumTreePath {
    return new SparseMerkleSumTreePath(this.hash, SparseMerkleSumTreeRootNode.generatePath(path, this));
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
