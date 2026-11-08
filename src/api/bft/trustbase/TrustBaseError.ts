/**
 * Base class of the errors the Unicity Trust Base (UTB) codec raises. The subclasses are the error CLASSES a caller (and the shared
 * vectors) distinguish; the message carries the detail.
 */
export abstract class TrustBaseError extends Error {
  protected constructor(
    public readonly errorClass: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The bytes are not a well-formed deterministic UTB record: wrong tag, version or arity, truncated, trailing bytes, out-of-bounds sizes,
 * a second byte form of the same value.
 */
export class TrustBaseEncodingError extends TrustBaseError {
  public constructor(message: string) {
    super('encoding', message);
  }
}

/**
 * The record is well formed but a structure rule fails: epoch zero, member list, weights, keys, quorum threshold, hash lengths, genesis versus
 * non-genesis shape.
 */
export class TrustBaseInvalidError extends TrustBaseError {
  public constructor(message: string) {
    super('invalid', message);
  }
}

/**
 * The bytes are a well-formed trust-base response but not a complete bundle: a status other than OK, a continuation cursor, a partial range
 * (not starting at a genesis entry), a gap or a broken predecessor link, a header that disagrees with its entries.
 */
export class TrustBaseBundleError extends TrustBaseError {
  public constructor(message: string) {
    super('bundle', message);
  }
}

/**
 * A well-formed entry that does not extend its predecessor: a genesis entry where a successor is expected, another network, an epoch that is not
 * the predecessor's plus one, a start round that does not advance, a predecessor id that does not match, or a genesis that is not the pinned one.
 */
export class TrustBaseChainError extends TrustBaseError {
  public constructor(message: string) {
    super('chain', message);
  }
}

/** The entry is of another network than the history. */
export class TrustBaseNetworkError extends TrustBaseChainError {
  public constructor(message: string) {
    super(message);
  }
}

/** The entry's epoch is before the genesis epoch of the history, so no later fetch can supply it. */
export class TrustBaseBeforeGenesisError extends TrustBaseChainError {
  public constructor(message: string) {
    super(message);
  }
}

/**
 * A signature check failed: a signer that is not a member, a malformed or invalid signature (even among enough valid ones), or a signed weight
 * below the quorum threshold.
 */
export class TrustBaseSignatureError extends TrustBaseError {
  public constructor(message: string) {
    super('signature', message);
  }
}

/**
 * The history already holds a different entry for this epoch. Not retryable: one of the two histories is not the network's.
 */
export class TrustBaseConflictError extends TrustBaseError {
  public constructor(
    public readonly epoch: bigint,
    message: string,
    public readonly details: ITrustBaseConflictDetails | null = null,
  ) {
    super('conflict', message);
  }

  /** @returns {boolean} Whether the competing entry was verified against the held predecessor (a real fork, not just a different entry). */
  public get authenticated(): boolean {
    return this.details?.authenticated ?? false;
  }
}

/**
 * Evidence of a conflict: the two entry ids and, for an authenticated fork, the bytes of both entries (bounded by the entry size limit).
 */
export interface ITrustBaseConflictDetails {
  readonly authenticated: boolean;
  readonly epoch: bigint;
  readonly heldEntry: Uint8Array | null;
  readonly heldEntryId: Uint8Array;
  readonly network: number;
  readonly offeredEntry: Uint8Array | null;
  readonly offeredEntryId: Uint8Array;
}

/**
 * The session saw an authenticated fork after its release checkpoint and is closed to appends and verification until the application reopens it
 * with a checkpoint that selects a branch. The evidence stays readable on the session.
 */
export class HistoryConflictedError extends TrustBaseError {
  public constructor(public readonly conflict: TrustBaseConflictError) {
    super('historyConflicted', `The history is conflicted at epoch ${conflict.epoch}.`);
  }
}

/**
 * An entry or cache disagrees with the release checkpoint (epoch at or before the pinned tip). The checkpoint selects the authority; this is a
 * refusal, not a conflict, and it does not close the session.
 */
export class TrustBasePinMismatchError extends TrustBaseError {
  public constructor(message: string) {
    super('pinMismatch', message);
  }
}

/**
 * An embedded release pin or explicit pin is not what it claims (digest, structure, signature, id or epoch). Fatal, never rescued by a cache or a
 * remote source.
 */
export class ReleasePinInvalidError extends TrustBaseError {
  public constructor(message: string, options?: ErrorOptions) {
    super('releasePinInvalid', message);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** No release pin for the network and no explicit one. */
export class UnknownNetworkError extends TrustBaseError {
  public constructor(message: string) {
    super('unknownNetwork', message);
  }
}

/** The store could not be read or written. `reason` says which kind of failure. */
export class TrustBaseStoreError extends TrustBaseError {
  public constructor(
    public readonly reason: 'io' | 'oversize' | 'permission' | 'quota',
    message: string,
    options?: ErrorOptions,
  ) {
    super('store', message);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** A save lost its compare-and-swap race too often. Retryable by the application. */
export class CacheContendedError extends TrustBaseError {
  public constructor(message: string) {
    super('cacheContended', message);
  }
}

/**
 * The entry is more than one epoch ahead of the history's tip. Retryable once the missing entries are fetched.
 */
export class TrustBaseGapError extends TrustBaseError {
  public constructor(
    public readonly epoch: bigint,
    public readonly tipEpoch: bigint,
    message: string,
  ) {
    super('gap', message);
  }
}

/**
 * No source served the entries that were wanted: every source failed, answered with a refusal status, or served an entry the history refuses. The
 * causes are kept, in the order they happened. Not the same as "nothing newer": that is a result (no entries appended), not an error.
 */
export class TrustBaseUpdateError extends TrustBaseError {
  public constructor(
    message: string,
    public readonly causes: readonly unknown[],
    /** Entries appended before the call failed: a valid prefix stays held, and may be all the caller needed. */
    public readonly appended: number = 0,
  ) {
    super('update', message);
  }
}

/** Another writer holds the cache lock. Immediate, never waited on and never stolen: a lock left by a crash is for the application to clear. */
export class CacheBusyError extends TrustBaseError {
  public constructor(message: string) {
    super('cacheBusy', message);
  }
}
