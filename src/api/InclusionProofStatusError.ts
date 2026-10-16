import { InclusionProof } from './InclusionProof.js';
import { ProofStatusHint } from './ProofStatusHint.js';
import { SdkError } from './SdkError.js';
import { StateId } from './StateId.js';
import { InclusionProofVerificationStatus } from '../transaction/verification/rule/InclusionProofVerificationRule.js';

/**
 * Why waiting for an inclusion proof ended without one, as decided by the aggregator's answers.
 */
export type InclusionProofWaitFailure = 'conflict' | 'expired' | 'unknown';

/**
 * Base of the errors of {@link waitInclusionProof} that say "stop waiting and decide". One `instanceof` (or
 * {@link SdkError.is} plus `code`) catches all of them.
 *
 * The hint-driven ones are **unauthenticated hints** ("not a proof of absence, not a verdict"); the conflict is found by
 * comparing a served proof with the transaction.
 */
export abstract class InclusionProofWaitError<
  C extends InclusionProofWaitFailure = InclusionProofWaitFailure,
> extends SdkError {
  /** What ended the wait. */
  public abstract readonly code: C;
  /** True when submitting the same signed request again is a sensible next step. */
  public abstract readonly resubmittable: boolean;

  /**
   * @param {StateId} stateId State id that was waited for.
   * @param {string} message Message.
   */
  protected constructor(
    public readonly stateId: StateId,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The aggregator's (unauthenticated) hint ended the wait: `expired` or `unknown`. Carries the hint.
 *
 * Remember that the hint says nothing about the state being unspent and nothing about the transaction having failed.
 */
export abstract class InclusionProofStatusError<
  S extends 'expired' | 'unknown' = 'expired' | 'unknown',
> extends InclusionProofWaitError<S> {
  public readonly resubmittable = true;
  /** The hint the aggregator reported. */
  public abstract readonly status: S;
}

/**
 * The aggregator reports the request as dropped because its deadline passed before it was included.
 */
export class InclusionProofExpiredError extends InclusionProofStatusError<'expired'> {
  public readonly code = 'expired' as const;
  public override readonly name = 'InclusionProofExpiredError' as const;
  public readonly status = 'expired' as const;

  /**
   * @param {StateId} stateId State id that was waited for.
   */
  public constructor(stateId: StateId) {
    super(
      stateId,
      `The aggregator reports ${stateId.toString()} as expired: the request was dropped before it was included. ` +
        'This is an unauthenticated hint; the same signed request may be submitted again.',
    );
  }
}

/**
 * The aggregator does not know the request: never seen, misrouted, lost, or wiped by a restart.
 */
export class InclusionProofUnknownError extends InclusionProofStatusError<'unknown'> {
  public readonly code = 'unknown' as const;
  public override readonly name = 'InclusionProofUnknownError' as const;
  public readonly status = 'unknown' as const;

  /**
   * @param {StateId} stateId State id that was waited for.
   * @param {number} [waitedMs] How long the hint stayed unknown before the wait gave up.
   */
  public constructor(stateId: StateId, waitedMs: number = 0) {
    super(
      stateId,
      `The aggregator does not know ${stateId.toString()} (unknown for ${waitedMs} ms): not submitted to this ` +
        'aggregator, misrouted, lost or dropped. This is an unauthenticated hint, not a proof of absence or of the ' +
        'state being unspent; the same signed request may be submitted again.',
    );
  }
}

/**
 * The aggregator returned a proof for this state id that certifies a different request than the awaited transaction: a
 * conflicting submission (another device, a re-created transaction, an application bug) was queued first and will be
 * the one certified, so the awaited transaction was not and cannot be certified for this state. Not a status hint: it
 * is detected by comparing the proof's certification data with the transaction. Resubmitting the same request does not
 * help.
 *
 * The comparison happens before the proof's certificate is verified, so the proof carried here is **unverified**: verify
 * it against the trust base before relying on it (or on what it says about the other request). The message starts with
 * the legacy `Invalid inclusion proof status: <status>` text.
 */
export class InclusionProofConflictError extends InclusionProofWaitError<'conflict'> {
  public readonly code = 'conflict' as const;
  public override readonly name = 'InclusionProofConflictError' as const;
  public readonly resubmittable = false;

  /**
   * @param {string} reason Verification status that revealed the conflict.
   * @param {StateId} stateId State id that was waited for.
   * @param {InclusionProof} unverifiedInclusionProof The proof served for the state id, NOT authenticated.
   */
  public constructor(
    public readonly reason:
      | InclusionProofVerificationStatus.CERTIFICATION_DATA_MISMATCH
      | InclusionProofVerificationStatus.TRANSACTION_HASH_MISMATCH,
    stateId: StateId,
    public readonly unverifiedInclusionProof: InclusionProof,
  ) {
    super(
      stateId,
      `Invalid inclusion proof status: ${reason}: the aggregator certified another request for ${stateId.toString()}; ` +
        'this transaction was not (and cannot be) certified for that state.',
    );
  }
}

export type { ProofStatusHint };
