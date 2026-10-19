import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { UnicityCertificateVerifier } from '../api/bft/verification/UnicityCertificateVerifier.js';
import { ILongPollOptions } from '../api/ILongPollOptions.js';
import { InclusionProof } from '../api/InclusionProof.js';
import {
  InclusionProofConflictError,
  InclusionProofExpiredError,
  InclusionProofUnknownError,
} from '../api/InclusionProofStatusError.js';
import { JsonRpcDataError } from '../api/json-rpc/JsonRpcDataError.js';
import { JsonRpcNetworkError } from '../api/json-rpc/JsonRpcNetworkError.js';
import { StateId } from '../api/StateId.js';
import {
  abortable,
  joinSignals,
  removeAbortListener,
  SleepError,
  sleep,
  throwIfAborted,
} from '../internal/abortable.js';
import { longPollSettings, longPollWindow } from '../internal/longPoll.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../StateTransitionClient.js';
import { ITransaction } from '../transaction/ITransaction.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from '../transaction/verification/rule/InclusionProofVerificationRule.js';

/**
 * Options of {@link waitInclusionProof}.
 */
export interface IWaitInclusionProofOptions {
  /** Delay between polls in milliseconds. Defaults to 1000. */
  readonly intervalMs?: number;
  /**
   * Ask the aggregator to hold each poll while the state is pending (long poll, `waitMs`) instead of answering at once.
   * Defaults to `true`: the wait is then bounded by `timeoutMs` (or the signal), never by this option. `false` polls exactly as
   * SDK 3.0 did, no `waitMs` is sent. An object tunes the long poll, see {@link ILongPollOptions}.
   *
   * A server without the feature ignores the request, the wait then falls back to normal polling for the rest of this
   * call (nothing is cached across calls). The positional form never long polls.
   */
  readonly longPoll?: boolean | ILongPollOptions;
  /**
   * Abort signal that terminates polling. Defaults to a 15s timeout unless `timeoutMs` is given. To bound the wait in
   * time prefer `timeoutMs`: a bare signal cannot be read as a deadline, so each poll asks for the full 20s window.
   */
  readonly signal?: AbortSignal;
  /**
   * Ask the aggregator for its (unauthenticated) status hint and stop early on `expired` and `unknown`. Defaults to
   * `true`. `false` restores the behavior of SDK 3.0: nothing but the proof decides, the wait ends with a proof, an
   * error, or the signal.
   */
  readonly statusHints?: boolean;
  /**
   * Total time budget of the wait in milliseconds, counted from the call on a monotonic clock. With it the wait knows
   * how much time is left and sizes every long poll to fit (`min(window, left - margin)`), so it never asks for more than
   * the budget leaves; it applies together with `signal`, whichever ends first. Without `timeoutMs` and without `signal`
   * the budget is 15s. A caller `signal` alone says nothing about the time left (an `AbortSignal` is not a readable
   * deadline): the wait then asks for the preferred window and stops when the signal fires.
   */
  readonly timeoutMs?: number;
  /**
   * How long an `unknown` hint is tolerated, counted from the start of the wait, before the wait fails with
   * {@link InclusionProofUnknownError}. Defaults to two poll intervals; `0` fails at the first `unknown`. Ignored
   * without `statusHints`.
   */
  readonly unknownGraceMs?: number;
}

/** Budget of a wait that has neither a signal nor a `timeoutMs`: the behavior of SDK 3.0. */
const DEFAULT_BUDGET_MS = 15_000;
/** Pause that a long poll never undercuts, so that an instant or zero echo cannot make a tight loop. */
const MIN_POLL_GAP_MS = 10;
/** Greatest delay a platform timer accepts. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * The pause after a pending answer to a poll that asked for a wait. An immediate re-call is allowed only for a valid
 * positive echo, an answer that is pending (not an `unknown` hint) and a call that locally took at least the polling
 * interval; anything else sleeps the rest of the interval, never less than a small floor, so that a missing, zero or
 * hostile echo cannot make a tight loop. A missing echo means the endpoint ignored the wait: the normal pause.
 *
 * @param {number} interval Polling interval in milliseconds.
 * @param {number} tookMs Local duration of the call.
 * @param {number|null} waitedMs The echo of the aggregator.
 * @param {boolean} pending Whether the answer was pending rather than an `unknown` hint.
 * @returns {number|null} Milliseconds to sleep, `null` for an immediate re-call.
 */
function pacedPause(interval: number, tookMs: number, waitedMs: number | null, pending: boolean): number | null {
  // every pause of a long polling call has a small positive floor, so a configured zero interval cannot spin
  const paced = Math.max(interval, MIN_POLL_GAP_MS);
  if (waitedMs === null) {
    return paced;
  }
  if (pending && waitedMs > 0 && tookMs >= paced) {
    return null;
  }
  return pending ? Math.max(interval - tookMs, MIN_POLL_GAP_MS) : paced;
}

function checkTimeoutMs(timeoutMs: number | undefined): number | undefined {
  if (timeoutMs !== undefined && !(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= MAX_TIMER_MS)) {
    throw new RangeError(`timeoutMs must be a finite number in (0, ${MAX_TIMER_MS}].`);
  }
  return timeoutMs;
}

/**
 * The signal that ends a wait: the caller's own, or the 15s default, or one that joins the caller's signal with a
 * `timeoutMs` budget.
 */
class Deadline {
  public readonly signal: AbortSignal;
  private readonly detach: () => void;

  public constructor(caller: AbortSignal | undefined, timeoutMs: number | undefined, budgetMs: number | undefined) {
    if (timeoutMs === undefined) {
      this.signal = caller ?? AbortSignal.timeout(budgetMs ?? DEFAULT_BUDGET_MS);
      this.detach = (): void => undefined;
      return;
    }
    // a budget and possibly a caller signal: whichever ends first aborts one controller, with the reason it had
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException('The wait budget is spent.', 'TimeoutError'));
    }, timeoutMs);
    const onCaller = (): void => {
      if (!controller.signal.aborted) {
        controller.abort((caller as AbortSignal).reason);
      }
    };
    if (caller?.aborted) {
      onCaller();
    } else {
      caller?.addEventListener('abort', onCaller, { once: true });
    }
    this.signal = controller.signal;
    this.detach = (): void => {
      clearTimeout(timer);
      if (caller) {
        removeAbortListener(caller, onCaller);
      }
    };
  }

  public dispose(): void {
    this.detach();
  }
}

/** Aggregator answer: accepted, not yet certified. */
const CERTIFICATION_PENDING_CODE = -32021;
/** Aggregator answer: no proof known for the state (the JSON-RPC form of HTTP 404). */
const NOT_FOUND_CODE = -32020;

function isSignalLike(value: unknown): value is AbortSignal {
  return (
    typeof value === 'object' &&
    value !== null &&
    'aborted' in value &&
    typeof (value as { addEventListener?: unknown }).addEventListener === 'function'
  );
}

/**
 * Poll the aggregator until a valid inclusion proof for the given transaction
 * is available, or the abort signal fires.
 *
 * The returned promise always settles: once the signal has fired the wait
 * rejects, regardless of whether the deadline was reached while requesting,
 * while verifying, or while sleeping between polls.
 *
 * Unless `statusHints` is `false`, the wait asks the aggregator for its status hint. `pending` keeps waiting. The hint is
 * **unauthenticated**: it only decides when to stop waiting, it never makes a proof valid or invalid (a proof that is
 * present is verified exactly as before whatever the hint says), and `unknown`/`expired` is not a proof of absence. A
 * server that does not send a hint, or an unrecognized one, behaves as before. `unknown` is rechecked for a grace
 * period, because the wait normally starts right after submission and an HA instance that has not seen the request yet
 * answers `unknown`.
 *
 * @param {StateTransitionClient} client Client used to fetch inclusion proofs.
 * @param {RootTrustBase} trustBase Root trust base used to verify the inclusion certificate.
 * @param {PredicateVerifierService} predicateVerifier Verifier used to check the transaction predicate.
 * @param {UnicityCertificateVerifier} unicityCertificateVerifier Unicity certificate verifier.
 * @param {ITransaction} transaction Transaction whose inclusion is being awaited.
 * @param {IWaitInclusionProofOptions} [options] Signal, interval and hint handling.
 * @returns {Promise<InclusionProof>} Verified inclusion proof.
 * @throws {SleepError} If the abort signal fires before a proof is available.
 * @throws {InclusionProofExpiredError} If the aggregator hints the request as expired (and has no proof): it was dropped
 *   before inclusion. Resubmittable.
 * @throws {InclusionProofUnknownError} If the aggregator keeps hinting the request as unknown (and has no proof) for
 *   longer than `unknownGraceMs` since the wait began. Resubmittable.
 * @throws {InclusionProofConflictError} If the proof served for the state id certifies another request than the
 *   transaction (a conflicting submission was queued first); the proof is not yet authenticated. Not resubmittable.
 */
export function waitInclusionProof(
  client: StateTransitionClient,
  trustBase: RootTrustBase,
  predicateVerifier: PredicateVerifierService,
  unicityCertificateVerifier: UnicityCertificateVerifier,
  transaction: ITransaction,
  options?: IWaitInclusionProofOptions,
): Promise<InclusionProof>;
/**
 * @deprecated Positional form of SDK 3.0, kept as it was (no status hints, they need the options form): pass
 *   `{ signal, intervalMs }` instead.
 * @param {StateTransitionClient} client Client used to fetch inclusion proofs.
 * @param {RootTrustBase} trustBase Root trust base used to verify the inclusion certificate.
 * @param {PredicateVerifierService} predicateVerifier Verifier used to check the transaction predicate.
 * @param {UnicityCertificateVerifier} unicityCertificateVerifier Unicity certificate verifier.
 * @param {ITransaction} transaction Transaction whose inclusion is being awaited.
 * @param {AbortSignal} signal Abort signal that terminates polling. Defaults to a 15s timeout.
 * @param {number} interval Delay between polls in milliseconds. Defaults to 1000.
 * @returns {Promise<InclusionProof>} Verified inclusion proof.
 */
export function waitInclusionProof(
  client: StateTransitionClient,
  trustBase: RootTrustBase,
  predicateVerifier: PredicateVerifierService,
  unicityCertificateVerifier: UnicityCertificateVerifier,
  transaction: ITransaction,
  signal?: AbortSignal,
  interval?: number,
): Promise<InclusionProof>;
export async function waitInclusionProof(
  client: StateTransitionClient,
  trustBase: RootTrustBase,
  predicateVerifier: PredicateVerifierService,
  unicityCertificateVerifier: UnicityCertificateVerifier,
  transaction: ITransaction,
  signalOrOptions?: AbortSignal | IWaitInclusionProofOptions,
  positionalInterval?: number,
): Promise<InclusionProof> {
  // the options form, or the positional form of SDK 3.0 (a signal, possibly a wrapper exposing only the AbortSignal
  // surface, and an interval)
  const positional = positionalInterval !== undefined || isSignalLike(signalOrOptions);
  const options: IWaitInclusionProofOptions = positional ? {} : (signalOrOptions ?? {});
  const begun = performance.now();
  const callerSignal = positional ? (signalOrOptions as AbortSignal | undefined) : options.signal;
  const timeoutMs = checkTimeoutMs(options.timeoutMs);
  // the total budget when it is known: a `timeoutMs`, or the 15s default of a call with neither signal nor budget
  const budgetMs = timeoutMs ?? (callerSignal === undefined ? DEFAULT_BUDGET_MS : undefined);
  const interval = positional ? (positionalInterval ?? 1000) : (options.intervalMs ?? 1000);
  const statusHints = positional ? false : options.statusHints !== false;
  const longPoll = positional ? null : longPollSettings(options.longPoll, true);
  const deadline = new Deadline(callerSignal, timeoutMs, budgetMs);
  const signal = deadline.signal;
  // Long polling is dropped for the rest of this call when an answer shows the endpoint does not honor it; nothing
  // outlives the call.
  let longPolling = longPoll !== null;
  try {
    const stateId = await StateId.fromTransaction(transaction);
    const transactionHash = await transaction.calculateTransactionHash();
    const unknownGraceMs = options.unknownGraceMs ?? 2 * interval;
    const started = Date.now();
    const remainingMs = (): number | undefined =>
      budgetMs === undefined ? undefined : budgetMs - (performance.now() - begun);

    // A conflict is definitive only for a proof that is itself valid for the awaited state id: the served request's own
    // path to the UC root, shard binding and seal quorum verify, and its state id is the awaited one.
    const authenticatesAnotherRequest = async (inclusionProof: InclusionProof): Promise<boolean> => {
      const { certificationData } = inclusionProof;
      try {
        if (!(await StateId.fromCertificationData(certificationData)).equals(stateId)) {
          return false;
        }
        const own = await InclusionProofVerificationRule.verify(
          trustBase,
          predicateVerifier,
          unicityCertificateVerifier,
          inclusionProof,
          certificationData.transactionHash,
          certificationData.expiresAt,
          certificationData.lockScript,
          certificationData.sourceStateHash,
        );
        return own.status === InclusionProofVerificationStatus.OK;
      } catch {
        return false;
      }
    };

    interface IPollOutcome {
      readonly inclusionProof: InclusionProof | null;
      readonly pendingHint: boolean;
      readonly waitedMs: number | null;
    }

    // `waitMs` is sent only when a positive wait fits; the request then gets a transport timeout of wait + margin, kept
    // within the budget, which is an inconclusive answer and not a failure of the wait
    let requestTimedOut = false;
    const poll = async (requestSignal: AbortSignal, waitMs: number): Promise<IPollOutcome> => {
      requestTimedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let signalOfRequest = requestSignal;
      let joined: { signal: AbortSignal; dispose(): void } | undefined;
      if (waitMs > 0 && longPoll !== null) {
        const transport = new AbortController();
        const left = remainingMs();
        timer = setTimeout(
          () => {
            requestTimedOut = true;
            transport.abort();
          },
          Math.min(waitMs + longPoll.marginMs, left ?? Infinity, MAX_TIMER_MS),
        );
        joined = joinSignals(requestSignal, transport.signal);
        signalOfRequest = joined.signal;
      }
      let response;
      try {
        response = await client.getInclusionProof(stateId, {
          ...(statusHints ? { includeStatusHint: true } : {}),
          signal: signalOfRequest,
          ...(waitMs > 0 ? { waitMs } : {}),
        });
      } finally {
        clearTimeout(timer);
        joined?.dispose();
      }
      const { inclusionProof } = response;
      // without statusHints nothing but the proof counts, also what a server volunteers
      const statusHint = statusHints ? response.statusHint : null;
      // The aggregator has not certified this state yet. The response type is what says so; by the
      // time a proof exists it is complete, so there is nothing else here to poll through.
      if (inclusionProof == null) {
        // Unauthenticated hints decide only when to stop waiting. No status, `pending`, `included` without a proof, and
        // a status this SDK does not know keep the legacy behavior: poll on.
        if (statusHint === 'expired') {
          throw new InclusionProofExpiredError(stateId);
        }
        if (statusHint === 'unknown' && Date.now() - started >= unknownGraceMs) {
          throw new InclusionProofUnknownError(stateId, Date.now() - started);
        }
        return { inclusionProof: null, pendingHint: statusHint !== 'unknown', waitedMs: response.waitedMs };
      }

      const verificationStatus = await InclusionProofVerificationRule.verify(
        trustBase,
        predicateVerifier,
        unicityCertificateVerifier,
        inclusionProof,
        transactionHash,
        transaction.expiresAt,
        transaction.lockScript,
        transaction.sourceStateHash,
      );

      if (verificationStatus.status !== InclusionProofVerificationStatus.OK) {
        // another request was certified for this state id: typed, so that a conflicting submission is not reported as a
        // generic verification failure
        if (
          (verificationStatus.status === InclusionProofVerificationStatus.TRANSACTION_HASH_MISMATCH ||
            verificationStatus.status === InclusionProofVerificationStatus.CERTIFICATION_DATA_MISMATCH) &&
          (await authenticatesAnotherRequest(inclusionProof))
        ) {
          throw new InclusionProofConflictError(verificationStatus.status, stateId, inclusionProof);
        }
        // anything else, including a mismatching proof nobody authenticated, is an invalid response, not a conflict
        throw new Error(`Invalid inclusion proof status: ${verificationStatus.status}`);
      }

      return { inclusionProof, pendingHint: false, waitedMs: response.waitedMs };
    };

    while (true) {
      throwIfAborted(signal);

      const waitMs = longPolling && longPoll !== null ? longPollWindow(longPoll, remainingMs()) : 0;
      const callStarted = performance.now();
      // how long to pause before the next poll; `interval` is the legacy fixed pause
      let pause: number | null = longPoll === null ? interval : Math.max(interval, MIN_POLL_GAP_MS);
      try {
        const outcome = await abortable((requestSignal) => poll(requestSignal, waitMs), signal);
        if (outcome.inclusionProof !== null) {
          return outcome.inclusionProof;
        }
        if (waitMs > 0) {
          pause = pacedPause(interval, performance.now() - callStarted, outcome.waitedMs, outcome.pendingHint);
          // an answer without the echo: the endpoint ignores the wait, poll it the normal way from now on
          longPolling = outcome.waitedMs !== null;
        }
      } catch (err) {
        // A request that outlived its transport timeout, with the budget not spent, is an inconclusive answer. The
        // endpoint does not honor the wait then: poll the normal way.
        if (requestTimedOut && !signal.aborted && waitMs > 0) {
          longPolling = false;
          await sleep(Math.max(interval, MIN_POLL_GAP_MS), signal);
          continue;
        }
        // A missing proof is the expected "not certified yet" answer. JSON-RPC -32021 (certification pending) always keeps
        // polling. HTTP 404 and -32020 (no proof known for the state) are the legacy "unknown" answer: without status hints
        // they keep polling, with hints they follow the `unknown` hint (grace period, then InclusionProofUnknownError).
        // Anything else, including the {@link SleepError} raised on abort, ends the wait.
        const pending = err instanceof JsonRpcDataError && err.code === CERTIFICATION_PENDING_CODE;
        const unknown =
          (err instanceof JsonRpcNetworkError && err.status === 404) ||
          (err instanceof JsonRpcDataError && err.code === NOT_FOUND_CODE);
        if (!pending && !unknown) {
          throw err;
        }
        if (unknown && statusHints && Date.now() - started >= unknownGraceMs) {
          throw new InclusionProofUnknownError(stateId, Date.now() - started);
        }
        // these legacy errors carry no echo: the endpoint is not long polling
        if (waitMs > 0) {
          longPolling = false;
        }
      }

      if (pause !== null) {
        await sleep(pause, signal);
      }
    }
  } finally {
    deadline.dispose();
  }
}

export type { ILongPollOptions };
export { SleepError };
