import { findNoTrustBaseEntry } from './TrustBaseEntryResult.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { ITrustBaseSource } from '../../ITrustBaseSource.js';
import { TrustBaseUpdateError } from '../trustbase/TrustBaseError.js';
import { ITrustBaseUpdateOptions, ITrustBaseUpdateTarget, TrustBaseUpdater } from '../trustbase/TrustBaseUpdater.js';

/**
 * Verify, and when the only thing missing is a trust-base entry, update the history from the sources and verify once more.
 *
 * `verify` is run first. A result that carries no typed no-entry failure (OK, or any other failure), is returned as it is: no fetch
 * can help it. On the typed no-entry failure the history is updated (see {@link TrustBaseUpdater.update}); if that appended nothing, the first
 * result stands, and otherwise `verify` runs once more and its result is returned, whatever it is. There is no loop: one update, one retry.
 *
 * @param {ITrustBaseUpdateTarget} history The history `verify` reads. It is extended in place.
 * @param {ITrustBaseSource[]} sources Where newer entries come from.
 * @param {() => Promise<VerificationResult<VerificationStatus>>} verify The verification, run against `history`.
 * @param {ITrustBaseUpdateOptions} [options] Update options.
 * @returns {Promise<VerificationResult<VerificationStatus>>} The result of the last verification.
 * @throws {TrustBaseUpdateError} If the update failed (as opposed to finding nothing newer) and the entries it did append do not make the
 * verification possible.
 */
export async function verifyWithUpdate(
  history: ITrustBaseUpdateTarget,
  sources: readonly ITrustBaseSource[],
  verify: () => Promise<VerificationResult<VerificationStatus>>,
  options?: ITrustBaseUpdateOptions,
): Promise<VerificationResult<VerificationStatus>> {
  const first = await verify();
  if (findNoTrustBaseEntry(first) === null) {
    return first;
  }
  let appended: number;
  try {
    appended = await TrustBaseUpdater.update(history, sources, options);
  } catch (error) {
    // A later page may have failed after the entry that was needed arrived: the prefix is held, so verify again, and fail only if it still
    // lacks the entry.
    if (error instanceof TrustBaseUpdateError && error.appended > 0) {
      const retried = await verify();
      if (findNoTrustBaseEntry(retried) === null) {
        return retried;
      }
    }
    throw error;
  }
  return appended === 0 ? first : verify();
}
