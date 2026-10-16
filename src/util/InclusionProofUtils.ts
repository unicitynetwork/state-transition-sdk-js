import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { UnicityCertificateVerifier } from '../api/bft/verification/UnicityCertificateVerifier.js';
import { InclusionProof } from '../api/InclusionProof.js';
import {
  InclusionProofConflictError,
  InclusionProofExpiredError,
  InclusionProofUnknownError,
} from '../api/InclusionProofStatusError.js';
import { JsonRpcDataError } from '../api/json-rpc/JsonRpcDataError.js';
import { JsonRpcNetworkError } from '../api/json-rpc/JsonRpcNetworkError.js';
import { StateId } from '../api/StateId.js';
import { abortable, SleepError, sleep, throwIfAborted } from '../internal/abortable.js';
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
  /** Abort signal that terminates polling. Defaults to a 10s timeout. */
  readonly signal?: AbortSignal;
  /**
   * Ask the aggregator for its (unauthenticated) status hint and stop early on `expired` and `unknown`. Defaults to
   * `true`. `false` restores the behavior of SDK 3.0: nothing but the proof decides, the wait ends with a proof, an
   * error, or the signal.
   */
  readonly statusHints?: boolean;
  /**
   * How long an `unknown` hint is tolerated, counted from the start of the wait, before the wait fails with
   * {@link InclusionProofUnknownError}. Defaults to two poll intervals; `0` fails at the first `unknown`. Ignored
   * without `statusHints`.
   */
  readonly unknownGraceMs?: number;
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
 * @param {AbortSignal} signal Abort signal that terminates polling. Defaults to a 10s timeout.
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
  const signal: AbortSignal =
    (positional ? (signalOrOptions as AbortSignal | undefined) : options.signal) ?? AbortSignal.timeout(10000);
  const interval = positional ? (positionalInterval ?? 1000) : (options.intervalMs ?? 1000);
  const statusHints = positional ? false : options.statusHints !== false;
  const stateId = await StateId.fromTransaction(transaction);
  const transactionHash = await transaction.calculateTransactionHash();
  const unknownGraceMs = options.unknownGraceMs ?? 2 * interval;
  const started = Date.now();

  const poll = async (requestSignal: AbortSignal): Promise<InclusionProof | null> => {
    const response = await client.getInclusionProof(
      stateId,
      statusHints ? { includeStatusHint: true, signal: requestSignal } : { signal: requestSignal },
    );
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
      return null;
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
        verificationStatus.status === InclusionProofVerificationStatus.TRANSACTION_HASH_MISMATCH ||
        verificationStatus.status === InclusionProofVerificationStatus.CERTIFICATION_DATA_MISMATCH
      ) {
        throw new InclusionProofConflictError(verificationStatus.status, stateId, inclusionProof);
      }
      throw new Error(`Invalid inclusion proof status: ${verificationStatus.status}`);
    }

    return inclusionProof;
  };

  while (true) {
    throwIfAborted(signal);

    try {
      const inclusionProof = await abortable(poll, signal);
      if (inclusionProof !== null) {
        return inclusionProof;
      }
    } catch (err) {
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
    }

    await sleep(interval, signal);
  }
}

export { SleepError };
