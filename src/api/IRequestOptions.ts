/**
 * Per-request options accepted by aggregator client methods.
 */
export interface IRequestOptions {
  /**
   * Signal that cancels the request. Implementations performing network I/O
   * should forward it to the underlying transport so that an abandoned request
   * is released instead of running to completion.
   */
  readonly signal?: AbortSignal;
}

/**
 * Options of a single inclusion proof request.
 */
export interface IInclusionProofRequestOptions extends IRequestOptions {
  /**
   * Ask the aggregator for its status hint (`included` / `pending` / `expired` / `unknown`) next to the proof. Opt-in:
   * without it the request and the result are exactly what they always were. A server without the feature ignores
   * the flag (the wire parameter is called `includeStatus`) and answers as before, which is the legacy behavior (no
   * hint). The hint is **unauthenticated**, see {@link ProofStatusHint}.
   */
  readonly includeStatusHint?: boolean;

  /**
   * Ask the aggregator to hold the request for up to this many milliseconds while the state is accepted but not yet
   * certified (long poll), and to echo the time it waited as {@link InclusionProofResponse.waitedMs}. Opt-in: omitted,
   * the request and the result are exactly what they always were. `0` asks for the echo without waiting. The server
   * clamps the value to its own maximum and to what its own deadlines leave, and a server without the feature ignores
   * it, so neither the wait nor the echo is promised.
   *
   * This is a single request option, not a polling policy: the request returns the ordinary answer when the wait
   * ends, pending included. The HTTP exchange outlives the wait, so give the call a signal or deadline that is longer
   * than `waitMs`. A v2 error answer (for example `no_finalized_view`) may carry `error.data.waitedMs`; the single call
   * surfaces such an error as the plain `JsonRpcDataError` and does not interpret that echo, which only means "pace
   * normally" for the wait helper (see `waitInclusionProof` for a ready made policy). Must be an integer in
   * `[0, Number.MAX_SAFE_INTEGER]`, otherwise the call throws a `RangeError` before anything is sent (the batch call
   * rejects with a `BatchProofError` and consolidation with a `ConsolidationError` instead: each surface keeps its own
   * error type, do not write one `catch` for all three).
   */
  readonly waitMs?: number;
}
