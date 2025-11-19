import { Branch } from './Branch.js';
import { FinalizedLeafBranch } from './FinalizedLeafBranch.js';
import { SparseMerkleTreePath } from './SparseMerkleTreePath.js';
import { SparseMerkleTreePathStep } from './SparseMerkleTreePathStep.js';
import { calculateCommonPath } from './SparseMerkleTreePathUtils.js';
import { DataHash } from '../../hash/DataHash.js';
import { IDataHasher } from '../../hash/IDataHasher.js';
import { IDataHasherFactory } from '../../hash/IDataHasherFactory.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Sparse Merkle Tree root node implementation.
 */
export class SparseMerkleTreeRootNode {
  public readonly path = 1n;

  private constructor(
    public readonly left: Branch | null,
    public readonly right: Branch | null,
    public readonly hash: DataHash,
  ) {}

  /**
   * Creates a new instance of MerkleTreeRootNode.
   * @param left Root node left branch.
   * @param right Root node right branch.
   * @param factory Factory to create data hashers.
   * @return A promise that resolves to a new MerkleTreeRootNode instance.
   */
  public static async create(
    left: Branch | null,
    right: Branch | null,
    factory: IDataHasherFactory<IDataHasher>,
  ): Promise<SparseMerkleTreeRootNode> {
    const hash = await factory
      .create()
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(BigintConverter.encode(1n)),
          CborSerializer.encodeOptional(left?.hash.data, CborSerializer.encodeByteString),
          CborSerializer.encodeOptional(right?.hash.data, CborSerializer.encodeByteString),
        ),
      )
      .digest();

    return new SparseMerkleTreeRootNode(left ?? null, right ?? null, hash);
  }

  private static generatePath(
    remainingPath: bigint,
    parent: Branch | SparseMerkleTreeRootNode,
  ): ReadonlyArray<SparseMerkleTreePathStep> {
    if (parent instanceof FinalizedLeafBranch) {
      return [new SparseMerkleTreePathStep(parent.path, parent.data)];
    }

    const commonPath = calculateCommonPath(remainingPath, parent.path);
    remainingPath = remainingPath >> commonPath.length;

    if (commonPath.path !== parent.path || remainingPath === 1n) {
      return [
        new SparseMerkleTreePathStep(0n, parent.left?.hash.data ?? null),
        new SparseMerkleTreePathStep(parent.path, parent.right?.hash.data ?? null),
      ];
    }

    const isRight = remainingPath & 1n;
    const branch = isRight ? parent.right : parent.left;
    const siblingBranch = isRight ? parent.left : parent.right;

    const step = new SparseMerkleTreePathStep(parent.path, siblingBranch?.hash.data ?? null);

    if (branch === null) {
      return [new SparseMerkleTreePathStep(isRight, null), step];
    }

    return [...this.generatePath(remainingPath, branch), step];
  }

  /**
   * Generates a merkle tree traversal path.
   * @param path The path for which to generate the Merkle tree path.
   * @returns A MerkleTreePath instance representing the path in the tree.
   */
  public getPath(path: bigint): SparseMerkleTreePath {
    return new SparseMerkleTreePath(this.hash, SparseMerkleTreeRootNode.generatePath(path, this));
  }

  /**
   * Returns a string representation of the MerkleTreeRootNode.
   */
  public toString(): string {
    return dedent`
      Root: 
        Hash: ${this.hash.toString()}
      Left: 
        ${this.left ? this.left.toString() : 'null'}
      Right: 
        ${this.right ? this.right.toString() : 'null'}`;
  }
}
