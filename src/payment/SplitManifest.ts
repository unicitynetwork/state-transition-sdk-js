import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

/**
 * Split manifest: CBOR semantic tag 39046 applied directly to an array of
 * per-asset sum-tree root hashes, positionally aligned with the source token's
 * assets in canonical order. The certified burn transfer carries the manifest as
 * its auxiliary data, and the burn reason is the SHA-256 of its canonical encoding.
 */
export class SplitManifest {
  public static readonly CBOR_TAG = 39046n;

  private constructor(private readonly _roots: Uint8Array[]) {
    this._roots = _roots.map((root) => new Uint8Array(root));
  }

  /**
   * @returns {Uint8Array[]} Copy of the per-asset RSMST root digests.
   */
  public get roots(): Uint8Array[] {
    return this._roots.map((root) => new Uint8Array(root));
  }

  /**
   * Create a SplitManifest from per-asset root digests.
   *
   * @param {Uint8Array[]} roots Raw 32-byte RSMST root digests in canonical source-asset order.
   * @returns {SplitManifest} New manifest.
   * @throws {Error} If `roots` is empty or any root is not 32 bytes.
   */
  public static create(roots: Uint8Array[]): SplitManifest {
    if (roots.length === 0) {
      throw new Error('Split manifest must contain at least one root.');
    }

    for (const root of roots) {
      if (root.length !== 32) {
        throw new Error('Each split manifest root must be a 32-byte digest.');
      }
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
      if (digest.length !== 32) {
        throw new CborError('Each split manifest root must be a 32-byte digest.');
      }

      return digest;
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
      CborSerializer.encodeArray(...this._roots.map((root) => CborSerializer.encodeByteString(root))),
    );
  }
}
