import { RootTrustBaseV2 } from './RootTrustBaseV2.js';
import { TrustBaseBundleError, TrustBaseEncodingError } from './TrustBaseError.js';
import {
  encodeTrustBaseResponse,
  parseTrustBaseResponse,
  RESPONSE_TAG,
  RESPONSE_VERSION,
} from './TrustBaseResponseWire.js';
import { areUint8ArraysEqual } from '../../../util/TypedArrayUtils.js';
import { NetworkId } from '../../NetworkId.js';

/**
 * Budget of a bundle decode; a release supplies it, there is no fixed history length. `maxBytes` is checked before anything is read. `maxEntries`
 * is checked after the entry list has been split (the CBOR reader walks the array before the count is known), so what bounds that allocation is
 * the input size, `maxBytes`, not `maxEntries`.
 */
export interface ITrustBaseBundleLimits {
  readonly maxBytes: number;
  readonly maxEntries: number;
  /** Bytes of one entry. Default {@link TrustBaseBundle.MAX_ENTRY_BYTES}. */
  readonly maxEntryBytes?: number;
}

/**
 * A complete Unicity Trust Base release bundle: the GetTrustBase response (CBOR tag 39015) with status OK, starting at the genesis entry, ending
 * at the release tip, with no continuation cursor. The reference is bft-core `gettrustbase.DecodeBundle`.
 *
 * Wire form: tag 39015 over `[1, networkId, 0, fromEpoch, effectiveEnd, endEntryId, [entry...], null]`, each entry a complete tag-39000
 * {@link RootTrustBaseV2}, consecutive and ascending from the genesis, each linked to its predecessor by entry id. A one-entry bundle holds a
 * genesis entry only.
 *
 * Decoding checks the structure and the links, not the signatures: the history that installs the bundle authenticates every entry after the
 * genesis, and the genesis against a pinned entry id.
 */
export class TrustBaseBundle {
  public static readonly CBOR_TAG = RESPONSE_TAG;
  /**
   * Bound of one embedded entry in bytes: 128 KiB. A full entry (256 members, 128-byte node ids, 256 predecessor signatures) is about 95,400 bytes;
   * sixteen members need at most about 6 KiB.
   */
  public static readonly MAX_ENTRY_BYTES = 128 * 1024;
  public static readonly VERSION = RESPONSE_VERSION;
  private static readonly STATUS_OK = 0n;

  private constructor(
    public readonly networkId: NetworkId,
    private readonly _entries: RootTrustBaseV2[],
    private readonly _raw: Uint8Array[],
  ) {}

  /** @returns {RootTrustBaseV2[]} The entries, ascending from the genesis. */
  public get entries(): RootTrustBaseV2[] {
    return [...this._entries];
  }

  /** @returns {Uint8Array[]} Copies of the canonical bytes of each entry, ascending from the genesis. */
  public get raw(): Uint8Array[] {
    return this._raw.map((bytes) => new Uint8Array(bytes));
  }

  /** @returns {RootTrustBaseV2} The release tip, the last entry. */
  public get tip(): RootTrustBaseV2 {
    return this._entries[this._entries.length - 1];
  }

  /**
   * Strictly decode a complete bundle.
   *
   * @param {Uint8Array} bytes Tagged bundle.
   * @param {ITrustBaseBundleLimits} limits Size budget, checked before allocation.
   * @returns {Promise<TrustBaseBundle>} Decoded bundle.
   * @throws {TrustBaseEncodingError} If the bytes (or an entry) are not the deterministic encoding, or exceed the budget.
   * @throws {TrustBaseInvalidError} If an embedded entry fails a structure rule.
   * @throws {TrustBaseBundleError} If the response is not a complete, linked history from a genesis entry.
   */
  public static async decode(bytes: Uint8Array, limits: ITrustBaseBundleLimits): Promise<TrustBaseBundle> {
    if (bytes.length > limits.maxBytes) {
      throw new TrustBaseEncodingError(`${bytes.length} bytes exceed the budget of ${limits.maxBytes}.`);
    }

    const header = parseTrustBaseResponse(bytes, limits.maxEntries);

    if (header.status !== TrustBaseBundle.STATUS_OK) {
      throw new TrustBaseBundleError(`Status ${header.status}: not a complete bundle.`);
    }
    if (header.nextEpoch !== null) {
      throw new TrustBaseBundleError('A continuation cursor: not a complete bundle.');
    }
    if (header.entries.length === 0) {
      throw new TrustBaseBundleError('An OK response without entries.');
    }
    if (header.endEntryId === null) {
      throw new TrustBaseBundleError('No end entry id.');
    }

    const entries: RootTrustBaseV2[] = [];
    let previousId: Uint8Array | null = null;
    for (const [index, raw] of header.entries.entries()) {
      if (raw.length > (limits.maxEntryBytes ?? TrustBaseBundle.MAX_ENTRY_BYTES)) {
        throw new TrustBaseEncodingError(`Entry ${index} of ${raw.length} bytes.`);
      }

      const entry = RootTrustBaseV2.decode(raw);
      if (entry.networkId.id !== header.network) {
        throw new TrustBaseBundleError(
          `Entry ${index} of network ${entry.networkId.id} in a bundle for ${header.network}.`,
        );
      }

      const previous: RootTrustBaseV2 | undefined = entries[index - 1];
      if (previous === undefined) {
        if (!entry.isGenesis()) {
          throw new TrustBaseBundleError(`Epoch ${entry.epoch} is not a genesis entry (a partial range).`);
        }
        if (entry.epoch !== header.fromEpoch) {
          throw new TrustBaseBundleError(
            `First entry is epoch ${entry.epoch}, the bundle starts at ${header.fromEpoch}.`,
          );
        }
      } else {
        if (entry.epoch !== previous.epoch + 1n) {
          throw new TrustBaseBundleError(`Epoch ${entry.epoch} does not follow ${previous.epoch}.`);
        }
        if (previousId === null || !areUint8ArraysEqual(entry.previousEntryId, previousId)) {
          throw new TrustBaseBundleError(`Epoch ${entry.epoch} does not link to its predecessor.`);
        }
      }

      previousId = await entry.entryId();
      entries.push(entry);
    }

    const tip = entries[entries.length - 1];
    if (tip.epoch !== header.effectiveEnd) {
      throw new TrustBaseBundleError(`The bundle ends at epoch ${tip.epoch}, its header says ${header.effectiveEnd}.`);
    }
    if (previousId === null || !areUint8ArraysEqual(header.endEntryId, previousId)) {
      throw new TrustBaseBundleError('The end entry id differs from the last entry.');
    }

    return new TrustBaseBundle(entries[0].networkId, entries, header.entries);
  }

  /**
   * Encode entries as a complete bundle (status OK, no cursor, end entry id of the last entry). The inverse of {@link decode}: a decoded bundle
   * re-encodes to the same bytes. The entries are not authenticated here; a bundle that does not link is not produced.
   *
   * @param {RootTrustBaseV2[]} entries Consecutive entries ascending from the genesis, at least one.
   * @returns {Promise<Uint8Array>} Tagged bundle.
   * @throws {TrustBaseBundleError} If the list is empty or the entries do not form one linked chain of one network.
   */
  public static async encode(entries: readonly RootTrustBaseV2[]): Promise<Uint8Array> {
    if (entries.length === 0) {
      throw new TrustBaseBundleError('A bundle needs at least one entry.');
    }
    let previousId: Uint8Array | null = null;
    for (const [index, entry] of entries.entries()) {
      const previous: RootTrustBaseV2 | undefined = entries[index - 1];
      if (previous === undefined ? !entry.isGenesis() : entry.epoch !== previous.epoch + 1n) {
        throw new TrustBaseBundleError(`Entry ${index} does not continue the chain.`);
      }
      if (previousId !== null && !areUint8ArraysEqual(entry.previousEntryId, previousId)) {
        throw new TrustBaseBundleError(`Entry ${index} does not link to its predecessor.`);
      }
      previousId = await entry.entryId();
    }
    const tip = entries[entries.length - 1];
    return encodeTrustBaseResponse({
      effectiveEnd: tip.epoch,
      endEntryId: previousId,
      entries: entries.map((entry) => entry.encode()),
      fromEpoch: entries[0].epoch,
      network: tip.networkId.id,
      nextEpoch: null,
      status: 0n,
    });
  }
}
