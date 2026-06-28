import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { FinalizedBranch } from '../smt/radixsum/FinalizedBranch.js';
import { FinalizedLeafBranch } from '../smt/radixsum/FinalizedLeafBranch.js';
import { SparseMerkleSumTreeRootNode } from '../smt/radixsum/SparseMerkleSumTreeRootNode.js';
import { BigintConverter } from '../util/BigintConverter.js';
import { BitString } from '../util/BitString.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

/** One sibling entry of an explicit-depth RSMST inclusion proof. */
interface ISibling {
  readonly depth: number;
  readonly hash: DataHash;
  readonly sum: bigint;
}

/** Reconstructed RSMST root: digest and total sum. */
export interface ISplitAllocationRoot {
  readonly hash: DataHash;
  readonly sum: bigint;
}

/**
 * Split allocation inclusion proof for one output asset: the explicit-depth
 * inclusion proof of a radix sparse Merkle sum tree — a leaf-to-root sequence of
 * sibling entries `(depth, hash, sum)` with strictly decreasing depths. The asset
 * identifier, output identifier, leaf data, leaf amount and root hash are not
 * carried; the verifier supplies them. The empty proof is valid only when the
 * allocation tree holds a single output leaf.
 */
export class SplitAllocationProof {
  private constructor(private readonly siblings: ReadonlyArray<ISibling>) {}

  /**
   * @returns {number} Number of sibling entries in the proof.
   */
  public get length(): number {
    return this.siblings.length;
  }

  /**
   * Build a split allocation proof for the leaf with the given key by walking
   * the radix sum tree from the root to the leaf.
   *
   * @param {SparseMerkleSumTreeRootNode} root Root of the asset's radix sum tree.
   * @param {Uint8Array} key 32-byte output token identifier.
   * @returns {SplitAllocationProof} Inclusion proof for the key.
   * @throws {Error} If the key is not present in the tree.
   */
  public static create(root: SparseMerkleSumTreeRootNode, key: Uint8Array): SplitAllocationProof {
    const keyPath = BitString.fromBytesReversedLSB(key).toBigInt();
    const siblings: ISibling[] = [];

    let node: FinalizedBranch | SparseMerkleSumTreeRootNode | null = root;
    while (node != null) {
      if (node instanceof FinalizedLeafBranch) {
        if (!areUint8ArraysEqual(node.key, key)) {
          throw new Error(`Leaf not found for key: ${HexConverter.encode(key)}`);
        }

        siblings.reverse();
        return new SplitAllocationProof(siblings);
      }

      const isRight: number = Number((keyPath >> BigInt(node.depth)) & 1n);
      const sibling = isRight ? node.left : node.right;
      if (sibling != null) {
        siblings.push({ depth: node.depth, hash: sibling.hash, sum: sibling.value });
      }

      node = isRight ? node.right : node.left;
    }

    throw new Error('Could not construct split allocation proof: invalid path.');
  }

  /**
   * Create SplitAllocationProof from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes (an array of sibling entries).
   * @returns {SplitAllocationProof} Decoded proof.
   * @throws {CborError} On too many entries, an out-of-range or non-decreasing depth, or a non-positive or non-minimal sum.
   */
  public static fromCBOR(bytes: Uint8Array): SplitAllocationProof {
    const entries = CborDeserializer.decodeArray(bytes);
    if (entries.length > 256) {
      throw new CborError('A split allocation proof has at most 256 sibling entries.');
    }

    const siblings: ISibling[] = [];
    for (const entry of entries) {
      const fields = CborDeserializer.decodeArray(entry, 3);

      const depth = Number(CborDeserializer.decodeUnsignedInteger(fields[0]));
      if (depth > 255) {
        throw new CborError('Sibling depth must be in the range [0, 255].');
      }
      if (siblings.length > 0 && depth >= siblings[siblings.length - 1].depth) {
        throw new CborError('Sibling depths must be strictly decreasing from the leaf to the root.');
      }

      const sum = CborDeserializer.decodeBigInteger(fields[2], 32);
      if (sum <= 0n) {
        throw new CborError('Sibling sum must be strictly positive.');
      }

      siblings.push({
        depth,
        hash: new DataHash(HashAlgorithm.SHA256, CborDeserializer.decodeByteString(fields[1])),
        sum,
      });
    }

    return new SplitAllocationProof(siblings);
  }

  /**
   * Reconstruct the root digest and sum for this proof by hashing from the leaf
   * upward.
   *
   * @param {Uint8Array} key 32-byte output token identifier.
   * @param {Uint8Array} data 32-byte output commitment.
   * @param {bigint} value Strictly positive output amount for the asset.
   * @returns {Promise<ISplitAllocationRoot>} Reconstructed root digest and sum.
   * @throws {Error} If the inputs or proof are structurally invalid.
   */
  public async calculateRoot(key: Uint8Array, data: Uint8Array, value: bigint): Promise<ISplitAllocationRoot> {
    if (value <= 0n || value >= 1n << 256n) {
      throw new Error('Value must be a positive 256-bit integer.');
    }

    if (key.length !== 32) {
      throw new Error('Key must be 32 bytes long.');
    }

    if (data.length !== 32) {
      throw new Error('Data must be 32 bytes long.');
    }

    const keyPath = BitString.fromBytesReversedLSB(key).toBigInt();

    let hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(new Uint8Array([0x10]))
      .update(key)
      .update(data)
      .update(BigintConverter.encode(value, 32))
      .digest();
    let sum = value;

    for (const sibling of this.siblings) {
      const nextSum = sum + sibling.sum;
      if (nextSum >= 1n << 256n) {
        throw new Error('Reconstructed sum overflows 256 bits.');
      }

      const isRight = Number((keyPath >> BigInt(sibling.depth)) & 1n);
      const left = isRight ? { hash: sibling.hash, value: sibling.sum } : { hash, value: sum };
      const right = isRight ? { hash, value: sum } : { hash: sibling.hash, value: sibling.sum };

      hash = await new DataHasher(HashAlgorithm.SHA256)
        .update(new Uint8Array([0x11, sibling.depth]))
        .update(left.hash.data)
        .update(BigintConverter.encode(left.value, 32))
        .update(right.hash.data)
        .update(BigintConverter.encode(right.value, 32))
        .digest();
      sum = nextSum;
    }

    return { hash, sum };
  }

  /**
   * Convert SplitAllocationProof to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      ...this.siblings.map((sibling) =>
        CborSerializer.encodeArray(
          CborSerializer.encodeUnsignedInteger(sibling.depth),
          CborSerializer.encodeByteString(sibling.hash.data),
          CborSerializer.encodeBigInteger(sibling.sum),
        ),
      ),
    );
  }

  /**
   * @returns {string} String representation of the proof.
   */
  public toString(): string {
    return dedent`
      Split Allocation Proof
        Siblings: [
          ${this.siblings.map((sibling) => `(${sibling.depth}, ${sibling.hash.toString()}, ${sibling.sum})`).join('\n')}
        ]`;
  }

  /**
   * Verify this proof by reconstructing the root from the leaf upward and
   * checking it against the expected root digest and target sum.
   *
   * @param {Uint8Array} key 32-byte output token identifier.
   * @param {Uint8Array} data 32-byte output commitment.
   * @param {bigint} value Strictly positive output amount for the asset.
   * @param {DataHash} expectedRootHash Expected RSMST root digest from the manifest.
   * @param {bigint} expectedSum Expected reconstructed root sum.
   * @returns {Promise<boolean>} True if the proof reconstructs to the root and target sum.
   */
  public async verify(
    key: Uint8Array,
    data: Uint8Array,
    value: bigint,
    expectedRootHash: DataHash,
    expectedSum: bigint,
  ): Promise<boolean> {
    try {
      const root = await this.calculateRoot(key, data, value);
      return root.hash.equals(expectedRootHash) && root.sum === expectedSum;
    } catch {
      return false;
    }
  }
}
