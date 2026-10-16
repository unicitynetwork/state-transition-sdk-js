import { SdkError } from '../SdkError.js';

/**
 * Stable machine-readable reasons of {@link PartitionViewError}. Tests and callers must bind to these rather than to
 * message text.
 */
export type PartitionViewErrorReason =
  | 'authority'
  | 'bounds'
  | 'config_not_admitted'
  | 'enclosing_certificate_mismatch'
  | 'malformed'
  | 'seal_invalid'
  | 'topology'
  | 'tree_mismatch'
  | 'unsupported_version';

/**
 * Thrown when a partition view is malformed, out of bounds, does not match the trusted topology, does not hash into
 * the enclosing seal, or its seal cannot be authenticated, and by lookups of shards the authenticated view does not
 * commit to. `reason` is its discriminant (`kind` in the sibling error classes).
 */
export class PartitionViewError extends SdkError<'PartitionViewError'> {
  public override readonly name = 'PartitionViewError' as const;

  /**
   * @param {PartitionViewErrorReason} reason Stable reason.
   * @param {string} message Message.
   * @param {object} [options] Options.
   * @param {unknown} [options.cause] Underlying error.
   */
  public constructor(
    public readonly reason: PartitionViewErrorReason,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
  }

  /**
   * @param {unknown} error Anything that was thrown.
   * @returns {boolean} True for a partition view error of this or another copy of the SDK.
   */
  public static override is(error: unknown): error is PartitionViewError {
    return SdkError.is(error) && error.name === 'PartitionViewError';
  }
}
