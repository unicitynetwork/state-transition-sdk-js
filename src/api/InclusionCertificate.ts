import { StateId } from './StateId.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { FinalizedBranch } from '../smt/radix/FinalizedBranch.js';
import { FinalizedLeafBranch } from '../smt/radix/FinalizedLeafBranch.js';
import { SparseMerkleTreeRootNode } from '../smt/radix/SparseMerkleTreeRootNode.js';
import { BitString } from '../util/BitString.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

/**
 * Inclusion certificate for a leaf in a sparse Merkle tree.
 */
export class InclusionCertificate {
  private static readonly BITMAP_SIZE = 32;
  private static readonly MAX_DEPTH = 255;

  private constructor(
    private readonly bitmap: Uint8Array,
    private readonly siblings: DataHash[],
  ) {}

  /**
   * Create an InclusionCertificate from a sparse Merkle tree root and leaf key.
   *
   * @param {SparseMerkleTreeRootNode} root Root node of the tree.
   * @param {Uint8Array} key Leaf key.
   * @returns {InclusionCertificate} New certificate.
   * @throws {Error} If the path cannot be constructed.
   */
  public static create(root: SparseMerkleTreeRootNode, key: Uint8Array): InclusionCertificate {
    let node: FinalizedBranch | SparseMerkleTreeRootNode | null = root;

    const siblings: DataHash[] = [];
    const bitmap = new Uint8Array(InclusionCertificate.BITMAP_SIZE);
    const keyPath = BitString.fromBytesReversedLSB(key).toBigInt();

    while (node != null) {
      if (node instanceof FinalizedLeafBranch) {
        if (!areUint8ArraysEqual(node.key, key)) {
          throw new Error(`Leaf not found for key: ${HexConverter.encode(key)}`);
        }

        return new InclusionCertificate(bitmap, siblings);
      }

      const isRight: bigint = (keyPath >> BigInt(node.depth)) & 1n;

      const sibling = isRight ? node.left : node.right;

      if (sibling != null) {
        bitmap[Math.floor(node.depth / 8)] |= 1 << node.depth % 8;
        siblings.push(sibling.hash);
      }

      node = isRight ? node.right : node.left;
    }

    throw new Error('Could not construct inclusion certificate: Invalid path');
  }

  /**
   * Decode an InclusionCertificate from its byte encoding.
   *
   * @param {Uint8Array} bytes Encoded certificate.
   * @returns {InclusionCertificate} Decoded certificate.
   * @throws {Error} If the encoding is malformed.
   */
  public static decode(bytes: Uint8Array): InclusionCertificate {
    if (bytes.length < InclusionCertificate.BITMAP_SIZE) {
      throw new Error('Inclusion Certificate bitmap is invalid');
    }

    const siblingBytesLength = bytes.length - InclusionCertificate.BITMAP_SIZE;

    if (siblingBytesLength % HashAlgorithm.SHA256.length !== 0) {
      throw new Error('Inclusion Certificate siblings are misaligned');
    }

    let siblingsCount = 0;

    for (let i = 0; i < InclusionCertificate.BITMAP_SIZE; i++) {
      let x = bytes[i];
      x = x - ((x >>> 1) & 0x55);
      x = (x & 0x33) + ((x >>> 2) & 0x33);
      x = (x + (x >>> 4)) & 0x0f;
      siblingsCount += x;
    }

    if (siblingBytesLength / HashAlgorithm.SHA256.length !== siblingsCount) {
      throw new Error('Inclusion proof siblings count does not match bitmap');
    }

    const siblings: DataHash[] = [];
    for (let i = InclusionCertificate.BITMAP_SIZE; i < bytes.length; i += HashAlgorithm.SHA256.length) {
      siblings.push(new DataHash(HashAlgorithm.SHA256, bytes.slice(i, i + HashAlgorithm.SHA256.length)));
    }

    return new InclusionCertificate(bytes.slice(0, InclusionCertificate.BITMAP_SIZE), siblings);
  }

  /**
   * @returns {Uint8Array} Encoded certificate bytes.
   */
  public encode(): Uint8Array {
    const bytes = new Uint8Array(this.bitmap.length + this.siblings.length * HashAlgorithm.SHA256.length);
    bytes.set(this.bitmap);
    let position = this.bitmap.length;
    for (const sibling of this.siblings) {
      const data = sibling.data;
      bytes.set(data, position);
      position += data.length;
    }

    return bytes;
  }

  /**
   * @returns {string} String representation of the inclusion certificate.
   */
  public toString(): string {
    return dedent`
      Inclusion Certificate
        Bitmap: ${HexConverter.encode(this.bitmap)}
        Siblings: [
          ${this.siblings.map((sibling) => sibling.toString()).join('\n')}
        ]`;
  }

  /**
   * Verify the certificate path against the expected root hash.
   *
   * @param {StateId} leafKey Leaf key.
   * @param {DataHash} leafValue Leaf value hash.
   * @param {DataHash} expectedRootHash Expected sparse Merkle tree root hash.
   * @returns {Promise<boolean>} True if the path is valid.
   */
  public async verify(leafKey: StateId, leafValue: DataHash, expectedRootHash: DataHash): Promise<boolean> {
    const key = leafKey.data;
    const value = leafValue.data;

    let hash = await new DataHasher(HashAlgorithm.SHA256)
      .update(new Uint8Array([0x00]))
      .update(key)
      .update(value)
      .digest();

    const keyPath = BitString.fromBytesReversedLSB(key).toBigInt();
    const bitmapPath = BitString.fromBytesReversedLSB(this.bitmap).toBigInt();

    let position = this.siblings.length;
    for (let depth = InclusionCertificate.MAX_DEPTH; depth >= 0; depth--) {
      if (!((bitmapPath >> BigInt(depth)) & 1n)) continue;

      position -= 1;
      if (position < 0) return false;

      const sibling = this.siblings[position];

      let left: Uint8Array, right: Uint8Array;
      if ((keyPath >> BigInt(depth)) & 1n) {
        left = sibling.data;
        right = hash.data;
      } else {
        left = hash.data;
        right = sibling.data;
      }

      hash = await new DataHasher(HashAlgorithm.SHA256)
        .update(new Uint8Array([0x01, depth]))
        .update(left)
        .update(right)
        .digest();
    }

    return position === 0 && hash.equals(expectedRootHash);
  }
}
