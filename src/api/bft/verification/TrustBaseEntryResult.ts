import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { RootTrustBaseV2 } from '../trustbase/RootTrustBaseV2.js';

/**
 * Result of picking the trust-base entry a seal is checked against. On success it carries the entry.
 */
export class TrustBaseEntryResult extends VerificationResult<VerificationStatus> {
  public constructor(
    status: VerificationStatus,
    message: string,
    public readonly entry: RootTrustBaseV2 | null,
  ) {
    super('UnicitySealTrustBaseEntryRule', status, message);
  }
}

/**
 * The typed "no entry for this epoch" failure: the held history has no entry for the epoch of a seal. The caller can obtain the missing entries
 * (the update step of a later release), append them to the history, and verify again. It is a different failure from a bad signature or a seal
 * outside its epoch: nothing is wrong with the proof as far as is known.
 */
export class NoTrustBaseEntryResult extends TrustBaseEntryResult {
  public constructor(
    public readonly epoch: bigint,
    public readonly tipEpoch: bigint | null,
  ) {
    super(
      VerificationStatus.FAIL,
      `No trust-base entry for epoch ${epoch} (held tip: ${tipEpoch === null ? 'none' : tipEpoch}).`,
      null,
    );
  }
}

/**
 * Find the typed no-entry failure anywhere in a verification trace.
 *
 * @param {VerificationResult<unknown>} result Any verification result.
 * @returns {NoTrustBaseEntryResult|null} The first no-entry failure in the trace, or null when the failure (if any) is of another kind.
 */
export function findNoTrustBaseEntry(result: VerificationResult<unknown>): NoTrustBaseEntryResult | null {
  if (result instanceof NoTrustBaseEntryResult) {
    return result;
  }
  for (const child of result.results) {
    const found = findNoTrustBaseEntry(child);
    if (found !== null) {
      return found;
    }
  }
  return null;
}
