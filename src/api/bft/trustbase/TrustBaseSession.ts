import { ITrustBaseHistory } from './ITrustBaseHistory.js';
import {
  IReleasePin,
  RELEASE_PINS,
  releasePinFromBundle,
  selectPublicPin,
  TRUST_BASE_BUNDLE_LIMITS,
  VerifiedReleasePin,
} from './ReleasePin.js';
import { RootTrustBaseV2 } from './RootTrustBaseV2.js';
import { ITrustBaseBundleLimits, TrustBaseBundle } from './TrustBaseBundle.js';
import {
  CacheContendedError,
  HistoryConflictedError,
  TrustBaseConflictError,
  TrustBaseError,
  TrustBaseNetworkError,
  TrustBasePinMismatchError,
  TrustBaseStoreError,
} from './TrustBaseError.js';
import { TrustBaseAppendOutcome, TrustBaseHistory } from './TrustBaseHistory.js';
import { parseTrustBaseResponse } from './TrustBaseResponseWire.js';
import { ITrustBaseStore, LOCAL_NAMESPACE, PUBLIC_NAMESPACE, trustBaseCacheKey } from './TrustBaseStore.js';
import { ITrustBaseUpdateOptions, ITrustBaseUpdateTarget, TrustBaseUpdater } from './TrustBaseUpdater.js';
import { areUint8ArraysEqual } from '../../../util/TypedArrayUtils.js';
import { ITrustBaseSource } from '../../ITrustBaseSource.js';
import { NetworkId } from '../../NetworkId.js';

/** Why a cache was refused. */
export type CacheRejection = 'malformed' | 'oversize' | 'pinMismatch' | 'wrongGenesis' | 'wrongNetwork';

/**
 * What `open` reports about the cache. The session works either way: a cache that is refused or unreadable leaves the embedded history in place.
 */
export type CacheDiagnostic =
  | { readonly cause: unknown; readonly code: 'CacheRejected'; readonly reason: CacheRejection }
  | { readonly cause: unknown; readonly code: 'CacheUnavailable' };

/** The outcome of {@link TrustBaseSession.flush}. A failed save does not undo the verified in-memory history. */
export type FlushResult =
  | {
      /** A damaged cache the flush found and replaced, reported as `open` reports it. */
      readonly diagnostics: readonly CacheDiagnostic[];
      readonly status: 'saved';
      /** Whether the store was written; false when it already had everything or nothing here was unsaved. */
      readonly wrote: boolean;
    }
  | { readonly error: unknown; readonly status: 'pending' };

export interface ITrustBaseSessionOptions {
  /** Budget of every bundle the session loads or saves. Default {@link TRUST_BASE_BUNDLE_LIMITS}. */
  readonly limits?: ITrustBaseBundleLimits;
  /** Cancels the open. Nothing is published from a cancelled open. */
  readonly signal?: AbortSignal;
}

export interface IOpenPublicOptions extends ITrustBaseSessionOptions {
  /** An explicit pin that extends the built-in one (a newer checkpoint). Older or conflicting ones are refused. */
  readonly override?: IReleasePin;
  /** The release table. Default {@link RELEASE_PINS}; replacing it is for the release build and its tests, not for applications. */
  readonly table?: readonly IReleasePin[];
}

type ParsedCache =
  { readonly entries: RootTrustBaseV2[] } | { readonly cause: unknown; readonly reason: CacheRejection };

/** One write and at most three retries of a changed revision. */
const FLUSH_ATTEMPTS = 4;
function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * A trust-base history together with its release pin and its cache. It starts from the pinned release history, merges whatever compatible cache the
 * store holds (strictly re-verified: nothing in a store is trusted for its name, age or revision), takes later entries through {@link append} and
 * {@link refresh}, and saves one complete bundle by compare-and-swap.
 *
 * Verification reads {@link history}, a read-only view. An authenticated fork after the release checkpoint closes the session: every later append,
 * refresh and read of the view fails with {@link HistoryConflictedError} (the live session only; an untrusted store cannot make this survive
 * deletion or a fresh process, so the application records the incident). A mismatch in the pinned prefix is refused without closing it.
 */
export class TrustBaseSession implements ITrustBaseUpdateTarget {
  private _blocked: unknown = null;
  private _conflict: TrustBaseConflictError | null = null;
  private _dirty: boolean;
  private _queue: Promise<unknown> = Promise.resolve();
  private _repair = false;
  private readonly _view: ITrustBaseHistory;

  private constructor(
    private readonly _history: TrustBaseHistory,
    private readonly _pin: VerifiedReleasePin,
    private readonly _store: ITrustBaseStore,
    private readonly _key: string,
    private readonly _limits: ITrustBaseBundleLimits,
    dirty: boolean,
    public readonly diagnostics: readonly CacheDiagnostic[],
  ) {
    this._dirty = dirty;
    this._view = new TrustBaseSessionView(_history, () => this._conflict);
  }

  /** @returns {TrustBaseConflictError|null} The authenticated fork that closed the session, with its evidence, or null. */
  public get conflict(): TrustBaseConflictError | null {
    return this._conflict;
  }

  /** @returns {boolean} Whether entries are held that the store does not have yet (a failed or not yet attempted save). */
  public get dirty(): boolean {
    return this._dirty;
  }

  /** @returns {ITrustBaseHistory} The read-only view verification uses. */
  public get history(): ITrustBaseHistory {
    return this._view;
  }

  /** @returns {string} The store key. */
  public get key(): string {
    return this._key;
  }

  /** @returns {NetworkId|null} The network. */
  public get networkId(): NetworkId | null {
    return this._history.networkId;
  }

  /** @returns {RootTrustBaseV2|null} The latest held entry. */
  public get tip(): RootTrustBaseV2 | null {
    return this._history.tip;
  }

  /**
   * Open the session of a local or test network from that deployment's own GetTrustBase bundle (genesis to tip) alone: the pin is derived from the
   * bundle ({@link releasePinFromBundle}), the namespace is the fixed `local` (never `public`), and there is no release lineage check. Everything
   * else is as {@link TrustBaseSession.openPrivate}: the bundle and every cached or fetched entry are verified strictly.
   *
   * @param {Uint8Array} bundle Bundle bytes from your deployment (tag 39015, complete, from the genesis entry).
   * @param {ITrustBaseStore} store Store.
   * @param {ITrustBaseSessionOptions} [options] Options.
   * @returns {Promise<{session: TrustBaseSession, diagnostics: CacheDiagnostic[]}>} The session and what was found in the cache.
   * @throws {ReleasePinInvalidError} If the bundle is not a complete valid history.
   */
  public static async openLocal(
    bundle: Uint8Array,
    store: ITrustBaseStore,
    options: ITrustBaseSessionOptions = {},
  ): Promise<{ diagnostics: CacheDiagnostic[]; session: TrustBaseSession }> {
    const pin = await releasePinFromBundle(bundle, options.limits ?? TRUST_BASE_BUNDLE_LIMITS);
    return TrustBaseSession.openPrivate(LOCAL_NAMESPACE, pin, store, options);
  }

  /**
   * Open the session of a private or test network under an explicit authority: its own pin and a namespace of its own. This chooses another
   * authority; it does not switch any check off.
   *
   * @param {string} namespace Trust namespace, 1..64 bytes, no `/`, and not `public`.
   * @param {IReleasePin} pin The pin, with the full embedded bundle.
   * @param {ITrustBaseStore} store Store.
   * @param {ITrustBaseSessionOptions} [options] Options.
   * @returns {Promise<{session: TrustBaseSession, diagnostics: CacheDiagnostic[]}>} The session and what was found in the cache.
   * @throws {ReleasePinInvalidError} If the pin is invalid.
   */
  public static async openPrivate(
    namespace: string,
    pin: IReleasePin,
    store: ITrustBaseStore,
    options: ITrustBaseSessionOptions = {},
  ): Promise<{ diagnostics: CacheDiagnostic[]; session: TrustBaseSession }> {
    if (
      namespace === PUBLIC_NAMESPACE ||
      namespace.includes('/') ||
      utf8Length(namespace) < 1 ||
      utf8Length(namespace) > 64
    ) {
      throw new RangeError('A private authority needs its own namespace.');
    }
    const selected = await VerifiedReleasePin.verify(pin, options.limits ?? TRUST_BASE_BUNDLE_LIMITS);
    return TrustBaseSession.open(selected, namespace, store, options);
  }

  /**
   * Open the session of a public network: the release table row, or an override that extends it.
   *
   * @param {NetworkId} network Network.
   * @param {ITrustBaseStore} store Store.
   * @param {IOpenPublicOptions} [options] Options.
   * @returns {Promise<{session: TrustBaseSession, diagnostics: CacheDiagnostic[]}>} The session and what was found in the cache.
   * @throws {UnknownNetworkError} If the network has no pin.
   * @throws {ReleasePinInvalidError} If the pin (or the override) is invalid. Never rescued by the cache.
   */
  public static async openPublic(
    network: NetworkId,
    store: ITrustBaseStore,
    options: IOpenPublicOptions = {},
  ): Promise<{ diagnostics: CacheDiagnostic[]; session: TrustBaseSession }> {
    const limits = options.limits ?? TRUST_BASE_BUNDLE_LIMITS;
    const selected = await selectPublicPin(network, options.table ?? RELEASE_PINS, options.override, limits);
    return TrustBaseSession.open(selected, PUBLIC_NAMESPACE, store, options);
  }

  private static async open(
    selected: { history: TrustBaseHistory; verified: VerifiedReleasePin },
    namespace: string,
    store: ITrustBaseStore,
    options: ITrustBaseSessionOptions,
  ): Promise<{ diagnostics: CacheDiagnostic[]; session: TrustBaseSession }> {
    const limits = options.limits ?? TRUST_BASE_BUNDLE_LIMITS;
    const { history, verified } = selected;
    const key = trustBaseCacheKey(verified.pin.networkId, verified.pin.genesisEntryId, namespace);
    const diagnostics: CacheDiagnostic[] = [];
    // The session is built first so that the cache goes through the same append as every later entry, but it is only handed out when complete.
    const session = new TrustBaseSession(history, verified, store, key, limits, false, diagnostics);

    let stored;
    try {
      stored = await store.read(key, limits.maxBytes);
    } catch (error) {
      if (error instanceof TrustBaseStoreError && error.reason === 'oversize') {
        diagnostics.push({ cause: error, code: 'CacheRejected', reason: 'oversize' });
        session._blocked = error;
      } else {
        diagnostics.push({ cause: error, code: 'CacheUnavailable' });
      }
      return { diagnostics, session };
    }
    if (stored === null) {
      return { diagnostics, session };
    }

    const parsed = await session.parseCache(stored.bytes, options.signal);
    if ('reason' in parsed) {
      diagnostics.push({ cause: parsed.cause, code: 'CacheRejected', reason: parsed.reason });
      // Damage is repaired at the next flush, by replacing exactly the revision observed. A history over the budget is valid, only too big for
      // this session: it is never replaced.
      session._repair = parsed.reason !== 'oversize';
      session._blocked = parsed.reason === 'oversize' ? parsed.cause : null;
      return { diagnostics, session };
    }
    const cacheTip = parsed.entries[parsed.entries.length - 1].epoch;
    try {
      await session.integrate(parsed.entries);
    } catch (error) {
      if (!(error instanceof TrustBasePinMismatchError)) {
        throw error;
      }
      // Nothing was appended before the mismatch: the divergent cache loses to the checkpoint.
      // An authenticated history that disagrees with the checkpoint is evidence, not damage: it is never overwritten.
      diagnostics.push({ cause: error, code: 'CacheRejected', reason: 'pinMismatch' });
      session._blocked = error;
      return { diagnostics, session };
    }
    // The merged history is longer than what the store has: an older cache upgraded by the pin.
    session._dirty = (session.tip?.epoch ?? 0n) > cacheTip;
    return { diagnostics, session };
  }

  /**
   * Add one entry, authenticated from the held entry before it.
   *
   * @param {RootTrustBaseV2} entry Entry.
   * @returns {Promise<TrustBaseAppendOutcome>} `appended` or `noop`.
   * @throws {HistoryConflictedError} If the session is closed by a fork.
   * @throws {TrustBaseConflictError} If this entry is an authenticated fork after the checkpoint; the session is closed.
   * @throws {TrustBasePinMismatchError} If it differs from the pinned prefix.
   * @throws {TrustBaseError} Any other refusal of {@link TrustBaseHistory.append}.
   */
  public append(entry: RootTrustBaseV2): Promise<TrustBaseAppendOutcome> {
    return this.enqueue(() => this.appendNow(entry));
  }

  /** @returns {Promise<Uint8Array>} The held history as one complete bundle. Available on a conflicted session too. */
  public exportBundle(): Promise<Uint8Array> {
    return this._history.toBundle();
  }

  /**
   * Save the held history if it is not saved yet. Writes one complete bundle by compare-and-swap: the stored bytes are reread and fully validated,
   * a compatible longer suffix is imported, and a changed revision is retried up to three times.
   *
   * A clean session (nothing unsaved, no damaged or blocked cache to deal with) flushes without reading the store: `saved` then means nothing
   * held here is unsaved, not that the store matches. A suffix another writer saved, or a fork in the store, is found when the session is opened
   * again or when something here is saved.
   *
   * @returns {Promise<FlushResult>} `saved` (with the damaged cache it replaced, if any, and whether it wrote), or `pending` with the reason (the
   *   history stays dirty; the application may retry).
   */
  public flush(): Promise<FlushResult> {
    return this.enqueue(() => this.flushNow());
  }

  /**
   * Fetch the entries after the held tip from the sources (see {@link TrustBaseUpdater}) and save the result.
   *
   * @param {ITrustBaseSource[]} sources Sources, tried in order.
   * @param {ITrustBaseUpdateOptions} [options] Update options.
   * @returns {Promise<{appended: number, flush: FlushResult}>} Entries appended and the save outcome.
   * @throws {HistoryConflictedError} If the session is closed by a fork.
   * @throws {TrustBaseConflictError} If a source served an authenticated fork.
   * @throws {TrustBaseUpdateError} If no source served the range.
   */
  public async refresh(
    sources: readonly ITrustBaseSource[],
    options?: ITrustBaseUpdateOptions,
  ): Promise<{ appended: number; flush: FlushResult }> {
    this.throwIfConflicted();
    let appended: number;
    try {
      appended = await TrustBaseUpdater.update(this, sources, options);
    } catch (error) {
      // A valid prefix stays held; saving it is still worth a try.
      await this.flush();
      throw error;
    }
    return { appended, flush: await this.flush() };
  }

  private async appendNow(entry: RootTrustBaseV2): Promise<TrustBaseAppendOutcome> {
    this.throwIfConflicted();
    const network = this._history.networkId;
    if (network !== null && !network.equals(entry.networkId)) {
      throw new TrustBaseNetworkError(`Network ${entry.networkId.id}, the history is of ${network.id}.`);
    }
    let outcome: TrustBaseAppendOutcome;
    try {
      outcome = await this._history.append(entry);
    } catch (error) {
      throw error instanceof TrustBaseConflictError ? await this.classifyConflict(entry, error) : error;
    }
    if (outcome === 'appended') {
      this._dirty = true;
    }
    return outcome;
  }

  /**
   * A different entry for a held epoch is not yet a fork: the pinned prefix is settled by the checkpoint, and after it the offered entry has to
   * verify against the held predecessor before it counts as evidence. Only then the session closes.
   */
  private async classifyConflict(entry: RootTrustBaseV2, error: TrustBaseConflictError): Promise<Error> {
    const pinned = entry.epoch <= this._pin.pinnedEpoch;
    const predecessor = this._history.entryForEpoch(entry.epoch - 1n);
    const held = this._history.entryForEpoch(entry.epoch);
    if (predecessor === null || held === null || error.details === null) {
      // The genesis epoch has no predecessor to verify against: the checkpoint settles it.
      return pinned ? new TrustBasePinMismatchError(`Epoch ${entry.epoch} differs from the pinned history.`) : error;
    }
    try {
      await entry.verifySuccessor(predecessor);
    } catch (refusal) {
      return refusal instanceof Error ? refusal : error;
    }
    if (pinned) {
      return new TrustBasePinMismatchError(`Epoch ${entry.epoch} differs from the pinned history.`);
    }
    this._conflict = new TrustBaseConflictError(entry.epoch, `An authenticated fork at epoch ${entry.epoch}.`, {
      ...error.details,
      authenticated: true,
      heldEntry: held.encode(),
      offeredEntry: entry.encode(),
    });
    return this._conflict;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this._queue.then(task);
    this._queue = result.catch(() => undefined);
    return result;
  }

  private async flushNow(): Promise<FlushResult> {
    if (this._conflict !== null) {
      return { error: new HistoryConflictedError(this._conflict), status: 'pending' };
    }
    // Clean means nothing here is unsaved; it does not mean the store matches. A rescan is a reopen.
    if (!this._dirty && !this._repair && this._blocked === null) {
      return { diagnostics: [], status: 'saved', wrote: false };
    }
    for (let attempt = 0; attempt < FLUSH_ATTEMPTS; attempt++) {
      let expected: string | null = null;
      const diagnostics: CacheDiagnostic[] = [];
      try {
        const stored = await this._store.read(this._key, this._limits.maxBytes);
        if (stored !== null) {
          expected = stored.revision;
          const parsed = await this.parseCache(stored.bytes);
          // Damage is replaced at exactly this revision; a compatible history gives its newer entries to the session first. A history over the
          // budget, or one that disagrees with the checkpoint, is never overwritten.
          if ('reason' in parsed) {
            if (parsed.reason === 'oversize') {
              this._blocked = parsed.cause;
              return { error: parsed.cause, status: 'pending' };
            }
            diagnostics.push({ cause: parsed.cause, code: 'CacheRejected', reason: parsed.reason });
          } else {
            if (!(await this.integrateCompatible(parsed.entries))) {
              this._blocked = new TrustBasePinMismatchError('The stored history disagrees with the checkpoint.');
              return { error: this._blocked, status: 'pending' };
            }
            this._blocked = null;
            const heldTip = this._history.tip;
            if (heldTip !== null && parsed.entries[parsed.entries.length - 1].epoch >= heldTip.epoch) {
              // The store already has everything held.
              this._dirty = false;
              this._repair = false;
              return { diagnostics, status: 'saved', wrote: false };
            }
          }
        }

        const bytes = await this._history.toBundle();
        if ((await this._store.compareAndSwap(this._key, expected, bytes)) === 'written') {
          // An append during the save keeps the history dirty.
          this._dirty = false;
          this._repair = false;
          return { diagnostics, status: 'saved', wrote: true };
        }
      } catch (error) {
        return { error, status: 'pending' };
      }
    }
    return { error: new CacheContendedError('The store changed during every save attempt.'), status: 'pending' };
  }

  /**
   * Give entries that were authenticated in a chain of their own to this session through {@link appendNow}: those it holds are no-ops (the first
   * held witness stays), those after its tip are appended, a different one is a pin mismatch or an authenticated fork.
   */
  private async integrate(entries: readonly RootTrustBaseV2[]): Promise<void> {
    for (const entry of entries) {
      await this.appendNow(entry);
    }
  }

  /** @returns {Promise<boolean>} False when the entries differ from the pinned prefix (a cache the checkpoint has superseded), true when integrated. */
  private async integrateCompatible(entries: readonly RootTrustBaseV2[]): Promise<boolean> {
    try {
      await this.integrate(entries);
      return true;
    } catch (error) {
      if (error instanceof TrustBasePinMismatchError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Decode stored bytes and authenticate them from the pinned genesis, in a history of their own: nothing reaches the session unless all of it
   * is valid.
   */
  private async parseCache(bytes: Uint8Array, signal?: AbortSignal): Promise<ParsedCache> {
    let bundle: TrustBaseBundle;
    try {
      if (bytes.length > this._limits.maxBytes) {
        return {
          cause: new TrustBaseStoreError('oversize', `${bytes.length} bytes exceed the budget.`),
          reason: 'oversize',
        };
      }
      // Bounded by maxBytes above; the entry count is judged below, as a budget and not as damage.
      const header = parseTrustBaseResponse(bytes, Number.MAX_SAFE_INTEGER);
      if (header.entries.length > this._limits.maxEntries) {
        return {
          cause: new TrustBaseStoreError('oversize', `${header.entries.length} entries exceed the budget.`),
          reason: 'oversize',
        };
      }
      const maxEntryBytes = this._limits.maxEntryBytes ?? TrustBaseBundle.MAX_ENTRY_BYTES;
      if (header.entries.some((entry) => entry.length > maxEntryBytes)) {
        return { cause: new TrustBaseStoreError('oversize', 'An entry exceeds the budget.'), reason: 'oversize' };
      }
      if (header.network !== this._pin.pin.networkId.id) {
        return { cause: new TrustBaseNetworkError('The cache header is of another network.'), reason: 'wrongNetwork' };
      }
      bundle = await TrustBaseBundle.decode(bytes, this._limits);
    } catch (cause) {
      if (cause instanceof TrustBaseError) {
        return { cause, reason: 'malformed' };
      }
      throw cause;
    }
    const entries = bundle.entries;
    if (!areUint8ArraysEqual(await entries[0].entryId(), this._pin.pin.genesisEntryId)) {
      return { cause: new TrustBaseStoreError('io', 'The cache starts at another genesis.'), reason: 'wrongGenesis' };
    }
    const staged = TrustBaseHistory.create(this._pin.pin.genesisEntryId);
    for (const entry of entries) {
      signal?.throwIfAborted();
      try {
        await staged.append(entry);
      } catch (cause) {
        if (cause instanceof TrustBaseError) {
          return { cause, reason: 'malformed' };
        }
        throw cause;
      }
    }
    return { entries };
  }

  private throwIfConflicted(): void {
    if (this._conflict !== null) {
      throw new HistoryConflictedError(this._conflict);
    }
  }
}

/** The read-only face of a session: it answers like a history until the session is closed by a fork, then every read fails. */
class TrustBaseSessionView implements ITrustBaseHistory {
  public constructor(
    private readonly _history: TrustBaseHistory,
    private readonly _conflict: () => TrustBaseConflictError | null,
  ) {}

  public get entries(): RootTrustBaseV2[] {
    return this.live().entries;
  }

  public get genesisPin(): Uint8Array {
    return this.live().genesisPin;
  }

  public get isEmpty(): boolean {
    return this.live().isEmpty;
  }

  public get networkId(): NetworkId | null {
    return this.live().networkId;
  }

  public get tip(): RootTrustBaseV2 | null {
    return this.live().tip;
  }

  public entryForEpoch(epoch: bigint): RootTrustBaseV2 | null {
    return this.live().entryForEpoch(epoch);
  }

  public epochEndRound(epoch: bigint): bigint | null {
    return this.live().epochEndRound(epoch);
  }

  private live(): TrustBaseHistory {
    const conflict = this._conflict();
    if (conflict !== null) {
      throw new HistoryConflictedError(conflict);
    }
    return this._history;
  }
}
