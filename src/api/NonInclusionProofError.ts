import { SdkError } from './SdkError.js';

/**
 * Why a non-inclusion request did not produce a proof. A rejection of an *absence claim* is not an error of this class:
 * it is the verdict of `verifyNonInclusion`.
 *
 * - `unavailable`: the service has no certified snapshot to answer from yet (`-32020`). Retryable.
 * - `busy`: the service is at its proof admission limit (`-32023`). Retryable.
 * - `rejected`: the service refused the request (invalid params, unknown method).
 * - `server`: an operational failure of the service, or an unknown error code (kept in `code`).
 * - `transport`: no valid JSON-RPC answer was obtained (network, an HTTP error without a JSON-RPC error envelope, a proxy
 *   page). Retryable. Never evidence about the state.
 * - `invalid_response`: an answer arrived but is not a valid one (envelope, hex, wrapper, certificate or certificate
 *   encoding). Never retried silently.
 * - `cancelled` / `timeout`: the caller's signal fired; `cause` is `signal.reason`. A reason named `TimeoutError`
 *   (`AbortSignal.timeout`) is a `timeout`.
 */
export type NonInclusionProofErrorKind =
  'busy' | 'cancelled' | 'invalid_response' | 'rejected' | 'server' | 'timeout' | 'transport' | 'unavailable';

/**
 * Failure to obtain a non-inclusion proof. Narrow with {@link NonInclusionProofError.is} (it also recognizes errors of
 * another copy of the SDK) and `kind`.
 */
export class NonInclusionProofError extends SdkError<'NonInclusionProofError'> {
  public override readonly name = 'NonInclusionProofError' as const;
  private readonly _code: number | undefined;
  private readonly _retryable: boolean;

  /**
   * @param {NonInclusionProofErrorKind} kind Classification.
   * @param {string} message Message.
   * @param {object} [info] Details.
   * @param {unknown} [info.cause] Underlying error, for a cancellation the caller's `signal.reason`.
   * @param {number} [info.code] JSON-RPC error code of the service, if there was one.
   * @param {boolean} [info.retryable] Whether a new attempt may succeed.
   */
  public constructor(
    public readonly kind: NonInclusionProofErrorKind,
    message: string,
    info: { readonly cause?: unknown; readonly code?: number; readonly retryable?: boolean } = {},
  ) {
    super(message, { cause: info.cause });
    this._code = info.code;
    this._retryable = info.retryable ?? false;
  }

  /**
   * @returns {number|undefined} JSON-RPC error code of the service, if any.
   */
  public get code(): number | undefined {
    return this._code;
  }

  /**
   * @returns {boolean} Whether a new attempt may succeed.
   */
  public get retryable(): boolean {
    return this._retryable;
  }

  /**
   * @param {unknown} error Anything that was thrown.
   * @returns {boolean} True for a non-inclusion error of this or another copy of the SDK.
   */
  public static override is(error: unknown): error is NonInclusionProofError {
    return SdkError.is(error) && error.name === 'NonInclusionProofError';
  }
}
