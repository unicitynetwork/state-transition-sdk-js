import { DataHash } from '../crypto/hash/DataHash.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

/**
 * Split manifest: CBOR semantic tag 39046 applied directly to an array of
 * per-asset sum-tree root hashes, positionally aligned with the source token's
 * assets in canonical order. The certified burn transfer carries the manifest as
 * its auxiliary data, and the burn reason is the SHA-256 of its canonical encoding.
 *
 * Roots are exposed as {@link DataHash} instances, so the digest length is
 * enforced by the hash type. On the wire each root is encoded as its raw digest
 * bytes (no algorithm imprint); decoding reconstructs SHA-256 hashes.
 */
export class SplitManifest {
  public static readonly CBOR_TAG = 39046n;

  private constructor(private readonly _roots: DataHash[]) {
    this._roots = _roots.slice();
  }

  /**
   * @returns {DataHash[]} Copy of the per-asset RSMST root hashes.
   */
  public get roots(): DataHash[] {
    return this._roots.slice();
  }

  /**
   * Create a SplitManifest from per-asset root hashes.
   *
   * @param {DataHash[]} roots RSMST root hashes in canonical source-asset order.
   * @returns {SplitManifest} New manifest.
   * @throws {Error} If `roots` is empty.
   */
  public static create(roots: DataHash[]): SplitManifest {
    if (roots.length === 0) {
      throw new Error('Split manifest must contain at least one root.');
    }

    return new SplitManifest(roots);
  }

  /**
   * Create SplitManifest from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {SplitManifest} Decoded manifest.
   * @throws {CborError} On wrong tag or malformed roots.
   */
  public static fromCBOR(bytes: Uint8Array): SplitManifest {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== SplitManifest.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for SplitManifest: ${tag.tag}`);
    }

    const roots = CborDeserializer.decodeArray(tag.data).map((root) => {
      const digest = CborDeserializer.decodeByteString(root);
      if (digest.length !== HashAlgorithm.SHA256.length) {
        throw new CborError('Each split manifest root must be a SHA-256 digest.');
      }

      return new DataHash(HashAlgorithm.SHA256, digest);
    });

    return SplitManifest.create(roots);
  }

  /**
   * Convert SplitManifest to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      SplitManifest.CBOR_TAG,
      CborSerializer.encodeArray(...this._roots.map((root) => CborSerializer.encodeByteString(root.data))),
    );
  }
}
