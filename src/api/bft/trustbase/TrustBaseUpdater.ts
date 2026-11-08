import { RootTrustBaseV2 } from './RootTrustBaseV2.js';
import {
  HistoryConflictedError,
  TrustBaseConflictError,
  TrustBaseError,
  TrustBaseUpdateError,
} from './TrustBaseError.js';
import { TrustBaseAppendOutcome } from './TrustBaseHistory.js';
import { ITrustBaseRangeLimits, TRUST_BASE_PAGE_LIMITS, TrustBaseRange, TrustBaseStatus } from './TrustBaseRange.js';
import { areUint8ArraysEqual } from '../../../util/TypedArrayUtils.js';
import { ITrustBaseRequest, ITrustBaseSource } from '../../ITrustBaseSource.js';
import { NetworkId } from '../../NetworkId.js';

/**
 * What the updater extends: a {@link TrustBaseHistory}, or a session that adds its own rules (an authenticated fork closes it).
 */
export interface ITrustBaseUpdateTarget {
  readonly networkId: NetworkId | null;
  readonly tip: RootTrustBaseV2 | null;
  append(entry: RootTrustBaseV2): Promise<TrustBaseAppendOutcome>;
}

/** Options of {@link TrustBaseUpdater.update}. */
export interface ITrustBaseUpdateOptions {
  /** Pause between passes over the sources, in milliseconds. Default 200. */
  readonly backoffMs?: number;
  /** First epoch of the network, used only while the history is still empty. Default 1. */
  readonly genesisEpoch?: bigint;
  /** Page budget of the response decode. Default {@link TRUST_BASE_PAGE_LIMITS}. */
  readonly limits?: ITrustBaseRangeLimits;
  /** The network, required while the history is empty (it is the history's own network otherwise). */
  readonly network?: NetworkId;
  /** Passes over the sources before giving up. Default 2. */
  readonly rounds?: number;
  /** Cancels the update. */
  readonly signal?: AbortSignal;
}

/**
 * Catches a {@link TrustBaseHistory} up from untrusted sources. It follows bft-core `gettrustbase.Sync`: the entries after the held tip are fetched
 * page by page and each is appended through `TrustBaseHistory.append`, which authenticates it from the entry before it. The first page freezes the
 * end epoch and its entry id and every later page echoes them, so a source that lags or is on another history is skipped and the next continues from
 * the same cursor. An authenticated prefix is kept even when a later page fails.
 */
export class TrustBaseUpdater {
  /** Updates in flight, so concurrent callers of one history share one fetch. */
  private static readonly IN_FLIGHT = new WeakMap<ITrustBaseUpdateTarget, Promise<number>>();

  /**
   * Fetch and append the entries after the held tip.
   *
   * @param {TrustBaseHistory} history History to extend.
   * @param {ITrustBaseSource[]} sources Sources, tried in order.
   * @param {ITrustBaseUpdateOptions} [options] Options.
   * @returns {Promise<number>} The number of entries appended. 0 means the history is current as far as every source says (all answered "nothing
   *   newer"); that is a result, not an error, and nothing in it is authenticated.
   * @throws {TrustBaseUpdateError} If no source served the range: every source failed, refused, or served an entry the history refuses.
   */
  public static update(
    history: ITrustBaseUpdateTarget,
    sources: readonly ITrustBaseSource[],
    options: ITrustBaseUpdateOptions = {},
  ): Promise<number> {
    const running = TrustBaseUpdater.IN_FLIGHT.get(history);
    if (running !== undefined) {
      return running;
    }
    const promise = TrustBaseUpdater.run(history, sources, options).finally(() => {
      TrustBaseUpdater.IN_FLIGHT.delete(history);
    });
    TrustBaseUpdater.IN_FLIGHT.set(history, promise);
    return promise;
  }

  private static async run(
    history: ITrustBaseUpdateTarget,
    sources: readonly ITrustBaseSource[],
    options: ITrustBaseUpdateOptions,
  ): Promise<number> {
    if (sources.length === 0) {
      throw new TrustBaseUpdateError('No source.', []);
    }
    const network = history.networkId ?? options.network;
    if (network === undefined || network === null) {
      throw new TrustBaseUpdateError('The history is empty and no network was given.', []);
    }
    const limits = options.limits ?? TRUST_BASE_PAGE_LIMITS;
    const rounds = options.rounds ?? 2;
    const causes: unknown[] = [];
    const nextFrom = (): bigint => (history.tip === null ? (options.genesisEpoch ?? 1n) : history.tip.epoch + 1n);
    const final = new Set<number>();
    let appended = 0;
    // The cursor and the frozen snapshot belong to the whole call, not to a source: the next source continues where the last stopped, and a source
    // that only knows the older tip cannot end the call as "current" once any source announced a higher end. Both reset when an entry is refused.
    let from = nextFrom();
    let snapshot: ITrustBaseRequest['snapshot'] = null;

    for (let round = 0; round < rounds; round++) {
      if (round > 0) {
        await TrustBaseUpdater.sleep(options.backoffMs ?? 200, options.signal);
      }
      let current = 0;
      for (const [index, source] of sources.entries()) {
        if (final.has(index)) {
          continue;
        }
        for (;;) {
          options.signal?.throwIfAborted();
          if (nextFrom() > from) {
            // The history moved on by other means: the frozen range no longer applies.
            from = nextFrom();
            snapshot = null;
          }
          const request: ITrustBaseRequest = {
            fromEpoch: from,
            maxEntries: limits.maxEntries,
            network,
            snapshot,
          };

          let page: TrustBaseRange;
          try {
            page = await TrustBaseRange.decode(
              await source.getTrustBasePage(request, { signal: options.signal }),
              limits,
              network,
            );
          } catch (error) {
            options.signal?.throwIfAborted();
            causes.push(error);
            break;
          }

          // A source's tip is unauthenticated metadata: a lagging or hostile source must not end the update. Only when every source says there is
          // nothing newer is the history taken as current.
          if (page.status === TrustBaseStatus.NOT_YET_AVAILABLE && snapshot === null && page.effectiveEnd < from) {
            current++;
            break;
          }
          if (page.status !== TrustBaseStatus.OK) {
            causes.push(new TrustBaseUpdateError(`Source ${index}: ${TrustBaseStatus[page.status]}.`, []));
            if (page.status === TrustBaseStatus.HISTORY_MISMATCH && snapshot !== null) {
              // The snapshot was announced by some source's first page and is unauthenticated: a hostile source can announce a fake one, and then
              // every honest source refuses the echo. That refusal says nothing about this source's own history, so drop the snapshot, restart
              // from the held tip and ask this source again without it. The next mismatch carries no snapshot and is final, so this ends.
              snapshot = null;
              from = nextFrom();
              continue;
            }
            // Busy and unavailable may pass; the other refusals will not.
            if (page.status !== TrustBaseStatus.BUSY && page.status !== TrustBaseStatus.UNAVAILABLE) {
              final.add(index);
            }
            break;
          }
          if (
            page.fromEpoch !== from ||
            (snapshot !== null &&
              (page.effectiveEnd !== snapshot.end ||
                page.endEntryId === null ||
                !areUint8ArraysEqual(page.endEntryId, snapshot.entryId)))
          ) {
            causes.push(
              new TrustBaseUpdateError(`Source ${index}: the page does not continue the requested range.`, []),
            );
            break;
          }

          let refused = false;
          for (const entry of page.entries) {
            try {
              if ((await history.append(entry)) === 'appended') {
                appended++;
              }
            } catch (error) {
              if (
                !(error instanceof TrustBaseError) ||
                error instanceof HistoryConflictedError ||
                (error instanceof TrustBaseConflictError && error.authenticated)
              ) {
                // Not a refusal of this source: an authenticated fork is for the application, not for the next source.
                throw error;
              }
              // The source served an entry the history refuses: keep the authenticated prefix, drop the snapshot, try the next source.
              causes.push(error);
              refused = true;
              snapshot = null;
              from = nextFrom();
              break;
            }
          }
          if (refused) {
            break;
          }
          if (page.nextEpoch === null) {
            return appended;
          }
          snapshot ??= { end: page.effectiveEnd, entryId: new Uint8Array(page.endEntryId ?? []) };
          from = page.nextEpoch;
        }
      }
      if (current === sources.length) {
        return appended;
      }
    }

    throw new TrustBaseUpdateError('No source served the range.', causes, appended);
  }

  private static sleep(ms: number, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(new Error('The update was aborted.', { cause: signal?.reason }));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
