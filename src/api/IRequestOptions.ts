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
}
