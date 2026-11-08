import { VerificationStatus } from '../../../../verification/VerificationStatus.js';
import { ITrustBaseHistory } from '../../trustbase/ITrustBaseHistory.js';
import { UnicitySeal } from '../../UnicitySeal.js';
import { NoTrustBaseEntryResult, TrustBaseEntryResult } from '../TrustBaseEntryResult.js';

/**
 * Rule that picks the trust-base entry of the seal's epoch and checks the seal belongs to it: the same network, and a root chain round inside
 * the epoch's interval (from the entry's start round, up to the start round of the held successor, if there is one).
 */
export class UnicitySealTrustBaseEntryRule {
  /**
   * @param {ITrustBaseHistory} history Held trust-base history.
   * @param {UnicitySeal} seal Seal to place.
   * @returns {TrustBaseEntryResult} The entry on success; a {@link NoTrustBaseEntryResult} when the epoch is above the held tip or the history is empty; an ordinary failure for another network or an epoch before the genesis.
   */
  public static verify(history: ITrustBaseHistory, seal: UnicitySeal): TrustBaseEntryResult {
    // Network first: a seal of another network is no business of any fetch, whatever its epoch.
    const historyNetwork = history.networkId;
    if (historyNetwork !== null && !historyNetwork.equals(seal.networkId)) {
      return new TrustBaseEntryResult(
        VerificationStatus.FAIL,
        'The seal is of another network than the history.',
        null,
      );
    }
    const entry = history.entryForEpoch(seal.epoch);
    if (entry === null) {
      const tip = history.tip;
      // Only an epoch above the held tip (or an empty history) can be supplied by a later fetch. An epoch before
      // the genesis can never be, so it is an ordinary failure.
      if (tip === null || seal.epoch > tip.epoch) {
        return new NoTrustBaseEntryResult(seal.epoch, tip?.epoch ?? null);
      }
      return new TrustBaseEntryResult(
        VerificationStatus.FAIL,
        `Epoch ${seal.epoch} is before the genesis epoch of the history.`,
        null,
      );
    }
    if (seal.rootChainRoundNumber < entry.epochStartRound) {
      return new TrustBaseEntryResult(
        VerificationStatus.FAIL,
        `Round ${seal.rootChainRoundNumber} is before the start ${entry.epochStartRound} of epoch ${entry.epoch}.`,
        null,
      );
    }
    const end = history.epochEndRound(entry.epoch);
    if (end !== null && seal.rootChainRoundNumber >= end) {
      return new TrustBaseEntryResult(
        VerificationStatus.FAIL,
        `Round ${seal.rootChainRoundNumber} is at or after the start ${end} of epoch ${entry.epoch + 1n}.`,
        null,
      );
    }
    return new TrustBaseEntryResult(VerificationStatus.OK, '', entry);
  }
}
