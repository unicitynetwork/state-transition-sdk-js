import { SdkError } from './SdkError.js';

/**
 * Classification of a failed `get_inclusion_proofs.v1` call. Applications switch on `kind` (and `detail`), they never
 * parse JSON-RPC reason strings.
 *
 * - `unavailable`: the service reports it cannot serve the material now (state not in the snapshot, view not retained
 *   or evicted, no finalized or partition view) or is under pressure (`busy`). Inputs are intact, a new attempt may
 *   succeed, waiting cannot make an excluded leaf appear in a fixed root.
 * - `unsupported`: the endpoint does not support the method or the configuration (e.g. a parent/child aggregator).
 * - `rejected`: the service refused the request itself (invalid params), retrying the same input cannot succeed.
 * - `limit_exceeded`: a method limit (state count, request or response size) was hit.
 * - `server`: operational failure of the service (database, internal or unknown error code), code preserved.
 * - `transport`: the HTTP exchange failed (connection error, non-success status).
 * - `invalid_response`: the response is malformed or inconsistent with the request.
 */
export type BatchProofErrorKind =
  'invalid_response' | 'limit_exceeded' | 'rejected' | 'server' | 'transport' | 'unavailable' | 'unsupported';

/**
 * Failure of a batch inclusion proof call. Caller cancellation is never wrapped: an aborted request rejects with the
 * platform's `AbortError`/`TimeoutError`.
 */
export class BatchProofError extends SdkError<'BatchProofError'> {
  public override readonly name = 'BatchProofError' as const;

  private readonly _code: number | undefined;

  private readonly _detail: string | undefined;

  private readonly _indexes: readonly number[] | undefined;

  private readonly _indexesByClass: BatchIndexesByClass | undefined;

  private readonly _requests: 0 | 1 | 2;

  private readonly _retryable: boolean;

  private readonly _waitedMs: number | null;

  /**
   * @param {BatchProofErrorKind} kind Classification.
   * @param {string} message Message.
   * @param {object} [info] Details echoed from the response.
   * @param {number} [info.code] JSON-RPC error code, if the failure was a JSON-RPC error.
   * @param {string} [info.detail] Service detail, e.g. `view_not_retained`, `busy:pinned_views`, `state_count`.
   * @param {number[]} [info.indexes] Positions in the request's state id list the service names as offending (state
   *   status details only).
   * @param {object} [info.indexesByClass] Offending positions by class, as the service sent them.
   * @param {boolean} [info.retryable] Whether a new attempt may succeed.
   * @param {number} [info.waitedMs] The aggregator's echo of the time it waited (`error.data.waitedMs`), when the request
   *   asked for a wait and the aggregator sent one.
   * @param {number} [info.requests] HTTP requests the call sent: 0 for a rejection before anything was sent (the
   *   default), 1, or 2 after the retry without `waitMs`.
   * @param {unknown} [info.cause] Underlying error.
   */
  public constructor(
    public readonly kind: BatchProofErrorKind,
    message: string,
    info: {
      readonly cause?: unknown;
      readonly code?: number;
      readonly detail?: string;
      readonly indexes?: readonly number[];
      readonly indexesByClass?: BatchIndexesByClass;
      readonly requests?: 0 | 1 | 2;
      readonly retryable?: boolean;
      readonly waitedMs?: number;
    } = {},
  ) {
    super(message, { cause: info.cause });
    this._code = info.code;
    this._detail = info.detail;
    this._indexes = info.indexes?.slice();
    this._indexesByClass = info.indexesByClass;
    this._retryable = info.retryable ?? false;
    this._waitedMs = info.waitedMs ?? null;
    this._requests = info.requests ?? 0;
  }

  /**
   * @returns {number|undefined} JSON-RPC error code, if any.
   */
  public get code(): number | undefined {
    return this._code;
  }

  /**
   * @returns {string|undefined} Service detail, if any.
   */
  public get detail(): string | undefined {
    return this._detail;
  }

  /**
   * @returns {number[]|undefined} Positions in the request's state id list that the service names as the cause of a
   *   state status failure, when it sent them.
   */
  public get indexes(): number[] | undefined {
    return this._indexes ? this._indexes.slice() : undefined;
  }

  /**
   * @returns {BatchIndexesByClass|undefined} The offending request positions of every class the service reported. A
   *   mixed outcome is reported under its most severe class (`unknown` over `expired` over `pending`) in
   *   {@link BatchProofError.detail}, the others are still listed here. Copies.
   */
  public get indexesByClass(): { -readonly [K in BatchIndexClass]?: number[] } | undefined {
    const classes = this._indexesByClass;
    if (!classes) {
      return undefined;
    }
    const copy: { -readonly [K in BatchIndexClass]?: number[] } = {};
    for (const klass of BATCH_INDEX_CLASSES) {
      const list = classes[klass];
      if (list) {
        copy[klass] = list.slice();
      }
    }
    return copy;
  }

  /**
   * @returns {number} HTTP requests the failed call sent: 0 if it was rejected locally before anything was sent, 2 if the first answer was the generic `malformed_params` of a
   *   server that does not know `waitMs` and the repeat without it failed as well.
   */
  public get requests(): 0 | 1 | 2 {
    return this._requests;
  }

  /**
   * @returns {boolean} Whether a new attempt may succeed. Never a promise that the same root will be served again.
   */
  public get retryable(): boolean {
    return this._retryable;
  }

  /**
   * @returns {number|null} The aggregator's **unauthenticated** echo of how long it held the request, in milliseconds,
   *   or `null` if the request asked for no wait or the aggregator sent no echo. Timing metadata only: it says nothing
   *   about the state and never extends a deadline. A failure raised before the method ran has none.
   */
  public get waitedMs(): number | null {
    return this._waitedMs;
  }

  /**
   * @param {unknown} error Anything that was thrown.
   * @returns {boolean} True for a batch proof error of this or another copy of the SDK.
   */
  public static override is(error: unknown): error is BatchProofError {
    return SdkError.is(error) && error.name === 'BatchProofError';
  }
}

/**
 * The classes of offending request positions a state status error can list.
 */
export const BATCH_INDEX_CLASSES = ['expired', 'not_in_root', 'pending', 'unknown'] as const;

export type BatchIndexClass = (typeof BATCH_INDEX_CLASSES)[number];

export type BatchIndexesByClass = { readonly [K in BatchIndexClass]?: readonly number[] };

/**
 * Details of the state status errors of `get_inclusion_proofs.v1` (`proof_unavailable`). Like the single proof status
 * they are **unauthenticated hints** about what one aggregator knows, never proof of absence.
 *
 * - `state_pending`: accepted and not certified yet in the latest view; retryable.
 * - `state_expired`: the request was dropped before inclusion; not retryable.
 * - `state_unknown`: this aggregator never saw it (misrouted, lost, restarted, other HA instance); not retryable.
 * - `state_not_in_root`: the state is not a leaf of the requested exact root; not retryable.
 */
export const BATCH_STATE_DETAILS = ['state_expired', 'state_not_in_root', 'state_pending', 'state_unknown'] as const;

export type BatchStateDetail = (typeof BATCH_STATE_DETAILS)[number];

/**
 * @param {string|undefined} detail Detail of a batch error.
 * @returns {boolean} True for one of the state status details.
 */
export function isBatchStateDetail(detail: string | undefined): detail is BatchStateDetail {
  return (BATCH_STATE_DETAILS as readonly string[]).includes(detail ?? '');
}
