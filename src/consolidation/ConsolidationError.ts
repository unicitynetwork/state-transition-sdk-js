import { ShardId } from '../api/bft/ShardId.js';
import { SdkError } from '../api/SdkError.js';

/**
 * Why a consolidation attempt did not produce a token. These are failures, not "unavailable" outcomes: an unavailable
 * outcome is the service explicitly reporting that it cannot serve the proof material now, see
 * {@link ConsolidationResult}.
 *
 * - `cancelled`: the caller's signal aborted the attempt. Never retryable by the SDK.
 * - `timeout`: the attempt's total deadline expired.
 * - `transport`: an HTTP exchange failed.
 * - `server`: a service reported an operational failure (database, internal or unknown error code).
 * - `rejected`: a service refused the request itself (invalid parameters); retrying the same input cannot succeed.
 * - `invalid_response`: a response is malformed or inconsistent with the request.
 * - `integrity`: the material is cryptographically or structurally refused, see {@link ConsolidationOutcome}. Never
 *   disguised as unavailability: signature, authority, path and binding failures always end here.
 * - `input`: the token or the configuration cannot be consolidated as given.
 */
export type ConsolidationErrorKind =
  'cancelled' | 'input' | 'integrity' | 'invalid_response' | 'rejected' | 'server' | 'timeout' | 'transport';

/**
 * Stable reason of an `integrity` or `input` failure. Mirrors the reference implementation's outcome names so that
 * shared fixtures bind to them rather than to message text.
 */
export type ConsolidationOutcome =
  | 'binding_mismatch'
  | 'expired'
  | 'incompatible_lineage'
  | 'invalid_input'
  | 'reference_time_after_target'
  | 'unauthenticated'
  | 'unsupported';

/**
 * What a {@link ConsolidationError} says, as a union that narrows: an `outcome` exists only for the kinds that carry one.
 */
export type ConsolidationFailure =
  | {
      readonly kind: 'cancelled' | 'invalid_response' | 'rejected' | 'server' | 'timeout' | 'transport';
      readonly outcome?: undefined;
    }
  | { readonly kind: 'input' | 'integrity'; readonly outcome: ConsolidationOutcome };

/**
 * Typed failure of a consolidation attempt. The original token is never modified by any outcome.
 *
 * Convention of the SDK's operations: they reject with their typed error and `cause` is **your** `signal.reason` when your
 * signal aborted them; a signal that aborts with a `TimeoutError` (`AbortSignal.timeout`) is a `timeout`. Use
 * {@link ConsolidationError.is} (it also recognizes errors of another copy of the SDK) and `failure` to narrow.
 */
export class ConsolidationError extends SdkError<'ConsolidationError'> {
  public override readonly name = 'ConsolidationError' as const;

  private readonly _detail: string | undefined;

  private readonly _outcome: ConsolidationOutcome | undefined;

  private readonly _retryable: boolean;

  private readonly _shard: ShardId | undefined;

  /**
   * @param {ConsolidationErrorKind} kind Classification.
   * @param {string} message Message.
   * @param {object} [info] Details.
   * @param {unknown} [info.cause] Underlying error.
   * @param {string} [info.detail] Service detail echoed from a failed call.
   * @param {ConsolidationOutcome} [info.outcome] Outcome of an `integrity` or `input` failure (ignored for other kinds).
   * @param {ShardId} [info.shard] Shard concerned.
   * @param {boolean} [info.retryable] Whether a new attempt may succeed.
   */
  public constructor(
    public readonly kind: ConsolidationErrorKind,
    message: string,
    info: {
      readonly cause?: unknown;
      readonly detail?: string;
      readonly outcome?: ConsolidationOutcome;
      readonly retryable?: boolean;
      readonly shard?: ShardId;
    } = {},
  ) {
    super(message, { cause: info.cause });
    this._detail = info.detail;
    this._outcome = kind === 'input' || kind === 'integrity' ? info.outcome : undefined;
    this._retryable = info.retryable ?? false;
    this._shard = info.shard;
  }

  /**
   * @returns {string|undefined} Service detail, if any.
   */
  public get detail(): string | undefined {
    return this._detail;
  }

  /**
   * @returns {ConsolidationFailure} Kind and outcome as a narrowing union.
   */
  public get failure(): ConsolidationFailure {
    return this.kind === 'input' || this.kind === 'integrity'
      ? { kind: this.kind, outcome: this._outcome ?? 'invalid_input' }
      : { kind: this.kind };
  }

  /**
   * @returns {ConsolidationOutcome|undefined} Outcome of an `integrity` or `input` failure, `undefined` otherwise.
   */
  public get outcome(): ConsolidationOutcome | undefined {
    return this._outcome;
  }

  /**
   * @returns {boolean} Whether a new attempt may succeed (transport failures and deadlines only; never a cancellation).
   */
  public get retryable(): boolean {
    return this._retryable;
  }

  /**
   * @returns {ShardId|undefined} Shard concerned.
   */
  public get shard(): ShardId | undefined {
    return this._shard;
  }

  /**
   * @param {unknown} error Anything that was thrown.
   * @returns {boolean} True for a consolidation error of this or another copy of the SDK.
   */
  public static override is(error: unknown): error is ConsolidationError {
    return SdkError.is(error) && error.name === 'ConsolidationError';
  }
}
