import { RootTrustBaseV2 } from './RootTrustBaseV2.js';
import { TrustBaseBundle } from './TrustBaseBundle.js';
import { TrustBaseBundleError, TrustBaseEncodingError } from './TrustBaseError.js';
import { parseTrustBaseResponse } from './TrustBaseResponseWire.js';
import { areUint8ArraysEqual } from '../../../util/TypedArrayUtils.js';
import { NetworkId } from '../../NetworkId.js';

/** Status of a GetTrustBase response. The numbers are the wire values (bft-core `gettrustbase.Status`). */
export enum TrustBaseStatus {
  OK = 0,
  INVALID_REQUEST = 1,
  WRONG_NETWORK = 2,
  NOT_YET_AVAILABLE = 3,
  HISTORY_MISMATCH = 4,
  LIMIT_TOO_SMALL = 5,
  BUSY = 6,
  UNAVAILABLE = 7,
}

/** Budget of a range decode; `maxBytes` is checked before anything is read. */
export interface ITrustBaseRangeLimits {
  readonly maxBytes: number;
  readonly maxEntries: number;
}

/** The page caps of the GetTrustBase protocol (bft-core `gettrustbase.PageLimits`). */
export const TRUST_BASE_PAGE_LIMITS: ITrustBaseRangeLimits = { maxBytes: 1 << 20, maxEntries: 64 };

/**
 * One page of the GetTrustBase protocol: the response (tag 39015) to a request for the entries from an epoch on. A status other than OK carries no
 * entries and no cursor; an OK page is a contiguous ascending run of entries of the response's network starting at `fromEpoch`, linked by entry id,
 * ending at `effectiveEnd` when no cursor remains, or at the epoch before the cursor otherwise. The reference is bft-core `gettrustbase.DecodeResponse`.
 *
 * Decoding checks structure and links only. Nothing here is authenticated: `effectiveEnd` and `endEntryId` are the source's claim, and every entry
 * is authenticated by `TrustBaseHistory.append` from the latest held entry.
 */
export class TrustBaseRange {
  private constructor(
    public readonly status: TrustBaseStatus,
    public readonly networkId: NetworkId,
    public readonly fromEpoch: bigint,
    public readonly effectiveEnd: bigint,
    public readonly endEntryId: Uint8Array | null,
    public readonly entries: readonly RootTrustBaseV2[],
    public readonly nextEpoch: bigint | null,
  ) {}

  /**
   * Strictly decode one page.
   *
   * @param {Uint8Array} bytes Tagged response.
   * @param {ITrustBaseRangeLimits} limits Size budget, checked before allocation.
   * @param {NetworkId} expectedNetwork The network that was asked for; a response for another one is refused.
   * @returns {Promise<TrustBaseRange>} The page.
   * @throws {TrustBaseEncodingError} If the bytes (or an entry) are not the deterministic encoding, or exceed the budget.
   * @throws {TrustBaseInvalidError} If an embedded entry fails a structure rule.
   * @throws {TrustBaseBundleError} If the page is inconsistent: status and cursor rules, network, start, order, links, end.
   */
  public static async decode(
    bytes: Uint8Array,
    limits: ITrustBaseRangeLimits,
    expectedNetwork: NetworkId,
  ): Promise<TrustBaseRange> {
    if (bytes.length > limits.maxBytes) {
      throw new TrustBaseEncodingError(`${bytes.length} bytes exceed the budget of ${limits.maxBytes}.`);
    }

    const header = parseTrustBaseResponse(bytes, limits.maxEntries);
    if (header.network !== expectedNetwork.id) {
      throw new TrustBaseBundleError(`A response for network ${header.network}, asked for ${expectedNetwork.id}.`);
    }
    const status: TrustBaseStatus = Number(header.status);
    const network = NetworkId.fromId(header.network);

    if (status !== TrustBaseStatus.OK) {
      if (header.entries.length !== 0 || header.nextEpoch !== null) {
        throw new TrustBaseBundleError(`Status ${TrustBaseStatus[status]} carries entries or a cursor.`);
      }
      return new TrustBaseRange(status, network, header.fromEpoch, header.effectiveEnd, header.endEntryId, [], null);
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
      if (raw.length > TrustBaseBundle.MAX_ENTRY_BYTES) {
        throw new TrustBaseEncodingError(`Entry ${index} of ${raw.length} bytes.`);
      }
      const entry = RootTrustBaseV2.decode(raw);
      if (entry.networkId.id !== header.network) {
        throw new TrustBaseBundleError(
          `Entry ${index} of network ${entry.networkId.id} in a page for ${header.network}.`,
        );
      }
      const previous: RootTrustBaseV2 | undefined = entries[index - 1];
      if (previous === undefined) {
        if (entry.epoch !== header.fromEpoch) {
          throw new TrustBaseBundleError(
            `First entry is epoch ${entry.epoch}, the page starts at ${header.fromEpoch}.`,
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

    const last = entries[entries.length - 1].epoch;
    if (header.nextEpoch === null) {
      if (last !== header.effectiveEnd) {
        throw new TrustBaseBundleError(
          `The page ends at epoch ${last} without a cursor before the effective end ${header.effectiveEnd}.`,
        );
      }
    } else if (header.nextEpoch !== last + 1n || header.nextEpoch > header.effectiveEnd) {
      throw new TrustBaseBundleError(`Cursor ${header.nextEpoch} after epoch ${last} (end ${header.effectiveEnd}).`);
    }
    if (last === header.effectiveEnd && (previousId === null || !areUint8ArraysEqual(header.endEntryId, previousId))) {
      throw new TrustBaseBundleError('The end entry id differs from the last entry.');
    }

    return new TrustBaseRange(
      status,
      network,
      header.fromEpoch,
      header.effectiveEnd,
      header.endEntryId,
      entries,
      header.nextEpoch,
    );
  }
}
