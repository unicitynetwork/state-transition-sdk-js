import { StateId } from './StateId.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { getBitAtDepth, regionFromKey } from '../smt/SparseMerkleTreePathUtils.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

/** What a non-inclusion certificate says about a key relative to one root. */
export type NonInclusionRelation = 'absent' | 'certificate_invalid' | 'state_included';

const KEY_LENGTH = 32;
const BITMAP_LENGTH = 32;
const MAX_JUNCTIONS = 256;

/**
 * The raw certificate of `get_non_inclusion_proof.v1`: the authenticated terminal leaf reached by walking the query at
 * every actual junction of the compressed radix tree, with the sibling hashes of the junctions.
 *
 * Wire bytes (the profile of rugregator, aggregator-go and the Rust SDK): empty is the certified empty tree; otherwise
 * exactly `bitmap[32] || sibling[32] * popcount(bitmap) || terminalKey[32] || terminalValue[32]`, which is
 * `96 + 32 * popcount` bytes and at most {@link NonInclusionCertificate.MAX_BYTES}. The query key is not part of it.
 *
 * This is only a codec and a path fold. It does not authenticate anything: the root it is checked against must come from
 * an authenticated certificate, see `verifyNonInclusion`.
 */
export class NonInclusionCertificate {
  /** Largest valid certificate: 256 junctions. */
  public static readonly MAX_BYTES = 96 + 32 * MAX_JUNCTIONS;

  private constructor(
    private readonly bitmap: Uint8Array | null,
    private readonly siblings: readonly Uint8Array[],
    private readonly terminalKey: Uint8Array | null,
    private readonly terminalValue: Uint8Array | null,
  ) {}

  /**
   * @returns {boolean} Whether this is the certificate of the empty tree.
   */
  public get isEmpty(): boolean {
    return this.bitmap === null;
  }

  /**
   * Strictly decode the certificate bytes. The length is checked against the bitmap before any path is allocated.
   *
   * @param {Uint8Array} bytes Certificate bytes, copied.
   * @returns {NonInclusionCertificate} Decoded certificate.
   * @throws {RangeError} If the bytes are not exactly the profile (oversized, truncated, trailing bytes).
   */
  public static fromBytes(bytes: Uint8Array): NonInclusionCertificate {
    if (bytes.length > NonInclusionCertificate.MAX_BYTES) {
      throw new RangeError(`Non-inclusion certificate exceeds ${NonInclusionCertificate.MAX_BYTES} bytes.`);
    }
    if (bytes.length === 0) {
      return new NonInclusionCertificate(null, [], null, null);
    }
    if (bytes.length < BITMAP_LENGTH) {
      throw new RangeError('Non-inclusion certificate is shorter than its bitmap.');
    }
    const copy = new Uint8Array(bytes);
    const bitmap = copy.subarray(0, BITMAP_LENGTH);
    let junctions = 0;
    for (const byte of bitmap) {
      for (let v = byte; v !== 0; v &= v - 1) {
        junctions++;
      }
    }
    const expected = 96 + 32 * junctions;
    if (copy.length !== expected) {
      throw new RangeError(`Non-inclusion certificate has ${copy.length} bytes, its bitmap requires ${expected}.`);
    }
    const siblings: Uint8Array[] = [];
    for (let i = 0; i < junctions; i++) {
      siblings.push(copy.slice(BITMAP_LENGTH + 32 * i, BITMAP_LENGTH + 32 * (i + 1)));
    }
    const tail = BITMAP_LENGTH + 32 * junctions;
    return new NonInclusionCertificate(
      copy.slice(0, BITMAP_LENGTH),
      siblings,
      copy.slice(tail, tail + KEY_LENGTH),
      copy.slice(tail + KEY_LENGTH),
    );
  }

  /**
   * @returns {Uint8Array} A copy of the wire bytes.
   */
  public toBytes(): Uint8Array {
    if (this.bitmap === null || this.terminalKey === null || this.terminalValue === null) {
      return new Uint8Array(0);
    }
    const out = new Uint8Array(96 + 32 * this.siblings.length);
    out.set(this.bitmap, 0);
    this.siblings.forEach((sibling, i) => out.set(sibling, BITMAP_LENGTH + 32 * i));
    const tail = BITMAP_LENGTH + 32 * this.siblings.length;
    out.set(this.terminalKey, tail);
    out.set(this.terminalValue, tail + KEY_LENGTH);
    return out;
  }

  /**
   * **Building block: this does not authenticate a seal or a certificate.** It only answers what the certificate
   * says about the state relative to `root`, a root the caller already authenticated. Use `verifyNonInclusion` for a
   * proof from a service.
   *
   * Relation to the root (all of which are statements about that one root, not about the present): the empty
   * certificate holds only for the empty tree (`root` null, never a zero hash); a nonempty one only for a 32-byte root;
   * the query must choose the terminal's side at every junction, and the folded path must equal the root.
   *
   * @param {StateId} stateId The queried state, bound by the caller (the wire does not carry it).
   * @param {Uint8Array|null} root Authenticated state root, `null` for the certified empty tree.
   * @returns {Promise<NonInclusionRelation>} `absent` if the terminal differs from the query, `state_included` if the
   *   authenticated terminal is the query, `certificate_invalid` otherwise.
   */
  public async verifyAgainstTrustedRoot(stateId: StateId, root: Uint8Array | null): Promise<NonInclusionRelation> {
    const query = stateId.data;
    if (query.length !== KEY_LENGTH) {
      return 'certificate_invalid';
    }
    if (this.bitmap === null || this.terminalKey === null || this.terminalValue === null) {
      return root === null ? 'absent' : 'certificate_invalid';
    }
    if (root === null || root.length !== 32) {
      return 'certificate_invalid';
    }

    const depths: number[] = [];
    for (let depth = 0; depth < MAX_JUNCTIONS; depth++) {
      if (getBitAtDepth(this.bitmap, depth) === 1) {
        depths.push(depth);
      }
    }
    // at every junction the query must take the terminal's branch: otherwise this is a path of another subtree
    for (const depth of depths) {
      if (getBitAtDepth(query, depth) !== getBitAtDepth(this.terminalKey, depth)) {
        return 'certificate_invalid';
      }
    }

    let hash = (
      await new DataHasher(HashAlgorithm.SHA256)
        .update(new Uint8Array([0x00]))
        .update(this.terminalKey)
        .update(this.terminalValue)
        .digest()
    ).data;
    for (let i = depths.length - 1; i >= 0; i--) {
      const depth = depths[i];
      const sibling = this.siblings[i];
      const hasher = new DataHasher(HashAlgorithm.SHA256)
        .update(new Uint8Array([0x01, depth]))
        .update(regionFromKey(this.terminalKey, depth));
      if (getBitAtDepth(this.terminalKey, depth) === 0) {
        hasher.update(hash).update(sibling);
      } else {
        hasher.update(sibling).update(hash);
      }
      hash = (await hasher.digest()).data;
    }

    if (!areUint8ArraysEqual(hash, root)) {
      return 'certificate_invalid';
    }
    return areUint8ArraysEqual(this.terminalKey, query) ? 'state_included' : 'absent';
  }
}
