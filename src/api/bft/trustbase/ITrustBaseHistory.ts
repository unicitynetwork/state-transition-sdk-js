import { RootTrustBaseV2 } from './RootTrustBaseV2.js';
import { NetworkId } from '../../NetworkId.js';

/**
 * What verification reads of a trust-base history: the held entries and their epoch intervals. A {@link TrustBaseHistory} is one; so is the view of
 * a {@link TrustBaseSession}, which stops answering once the session is conflicted.
 */
export interface ITrustBaseHistory {
  /** @returns {RootTrustBaseV2[]} The held entries, ascending from the genesis. */
  readonly entries: RootTrustBaseV2[];
  /** @returns {Uint8Array} Copy of the pinned entry id of the genesis. */
  readonly genesisPin: Uint8Array;
  /** @returns {boolean} Whether no entry is held yet. */
  readonly isEmpty: boolean;
  /** @returns {NetworkId|null} The network of the held entries, or null when empty. */
  readonly networkId: NetworkId | null;
  /** @returns {RootTrustBaseV2|null} The latest held entry, or null when empty. */
  readonly tip: RootTrustBaseV2 | null;
  /**
   * @param {bigint} epoch Epoch.
   * @returns {RootTrustBaseV2|null} The held entry, or null when none is held.
   */
  entryForEpoch(epoch: bigint): RootTrustBaseV2 | null;
  /**
   * @param {bigint} epoch Epoch.
   * @returns {bigint|null} Start round of the held successor, or null when none is held.
   */
  epochEndRound(epoch: bigint): bigint | null;
}
