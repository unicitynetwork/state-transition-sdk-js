import type { UnicityCertificate } from './UnicityCertificate.js';
import { HexConverter } from '../../util/HexConverter.js';

/**
 * Work counters of a {@link UnicityCertificateInterner}.
 */
export interface IInternerStats {
  /** Occurrences served from an earlier parse of the same complete bytes. */
  readonly hits: number;
  /** Actual parses. */
  readonly parses: number;
}

/**
 * Decodes each distinct wire unicity certificate once per decoding operation.
 *
 * Every proof of a consolidated token carries a copy of the same certificate, so decoding L proofs would parse the same
 * bytes L times. Reading the L copies is unavoidable, parsing them again is not: occurrences are matched by their
 * **complete** bytes (never a signature-excluding hash), only successful parses are remembered, and the memo is bounded
 * and scoped to the interner, i.e. to one token, batch or other decoding operation. Proofs decoded through one interner
 * share the certificate instance, which is immutable through its API.
 */
export class UnicityCertificateInterner {
  private readonly counters = { hits: 0, parses: 0 };
  private readonly entries = new Map<string, UnicityCertificate>();

  /**
   * @param {Function} parse Parser of one wire certificate.
   * @param {number} [maxEntries] Upper bound on remembered certificates, the oldest is dropped first.
   * @throws {Error} If `maxEntries` is not a positive integer.
   */
  public constructor(
    private readonly parse: (bytes: Uint8Array) => UnicityCertificate,
    private readonly maxEntries: number = 64,
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new RangeError('UnicityCertificateInterner maxEntries must be a positive integer');
    }
  }

  /**
   * @returns {IInternerStats} Snapshot of the counters.
   */
  public get stats(): IInternerStats {
    return { ...this.counters };
  }

  /**
   * @param {Uint8Array} bytes Complete wire certificate.
   * @returns {UnicityCertificate} The decoded certificate, parsed at most once per distinct complete bytes.
   * @throws {CborError} If the bytes are not a certificate (failures are not remembered).
   */
  public decode(bytes: Uint8Array): UnicityCertificate {
    const key = HexConverter.encode(bytes);
    const known = this.entries.get(key);
    if (known) {
      this.counters.hits++;
      return known;
    }

    const certificate = this.parse(bytes);
    this.counters.parses++;
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(key, certificate);
    return certificate;
  }
}
