import { RootTrustBaseV2 } from './RootTrustBaseV2.js';
import { TrustBaseBundle } from './TrustBaseBundle.js';
import {
  TrustBaseBeforeGenesisError,
  TrustBaseChainError,
  TrustBaseConflictError,
  TrustBaseGapError,
  TrustBaseInvalidError,
} from './TrustBaseError.js';
import { areUint8ArraysEqual } from '../../../util/TypedArrayUtils.js';
import { NetworkId } from '../../NetworkId.js';

/**
 * What {@link TrustBaseHistory.append} did with an entry that passed: it was added, or it was already held (nothing changed).
 */
export type TrustBaseAppendOutcome = 'appended' | 'noop';

/**
 * The append-only Unicity Trust Base history a verifier holds: consecutive entries from a genesis entry pinned out of band by its entry id, each
 * authenticated by a strict quorum of its predecessor's members. The reference is the shared vectors' history model (bft-go-base
 * `types/root_trust_base_v2_vectors_test.go`) and bft-core `utbstore`.
 *
 * `append` is the only way in, for the genesis and for every later entry, including those of a loaded bundle. An entry of a held epoch changes
 * nothing: the same entry id is a `noop` (its signature set must still verify, so a bad witness is an error), a different one is a conflict. An
 * entry more than one epoch ahead is a gap. Appends are serialised, so concurrent callers see one consistent chain.
 */
export class TrustBaseHistory {
  private readonly _entries: RootTrustBaseV2[] = [];
  private _queue: Promise<unknown> = Promise.resolve();

  private constructor(private readonly _genesisPin: Uint8Array) {}

  /** @returns {RootTrustBaseV2[]} The held entries, ascending from the genesis. */
  public get entries(): RootTrustBaseV2[] {
    return [...this._entries];
  }

  /** @returns {Uint8Array} Copy of the pinned entry id of the genesis. */
  public get genesisPin(): Uint8Array {
    return new Uint8Array(this._genesisPin);
  }

  /** @returns {boolean} Whether no entry is held yet. */
  public get isEmpty(): boolean {
    return this._entries.length === 0;
  }

  /** @returns {NetworkId|null} The network of the held entries, or null when empty. */
  public get networkId(): NetworkId | null {
    return this._entries[0]?.networkId ?? null;
  }

  /** @returns {RootTrustBaseV2|null} The latest held entry, or null when empty. */
  public get tip(): RootTrustBaseV2 | null {
    return this._entries[this._entries.length - 1] ?? null;
  }

  /**
   * An empty history bound to the genesis it will accept.
   *
   * @param {Uint8Array} genesisPin Entry id of the genesis entry, from outside the history (a release pin).
   * @returns {TrustBaseHistory} Empty history.
   * @throws {TrustBaseInvalidError} If the pin is not a 32-byte entry id.
   */
  public static create(genesisPin: Uint8Array): TrustBaseHistory {
    if (genesisPin.length !== RootTrustBaseV2.ID_LENGTH) {
      throw new TrustBaseInvalidError(`Genesis pin of ${genesisPin.length} bytes.`);
    }
    return new TrustBaseHistory(new Uint8Array(genesisPin));
  }

  /**
   * Load a complete bundle through {@link append}, like every later entry.
   *
   * @param {TrustBaseBundle} bundle Decoded bundle.
   * @param {Uint8Array} genesisPin Entry id of the genesis entry.
   * @returns {Promise<TrustBaseHistory>} History holding every entry of the bundle.
   * @throws {TrustBaseChainError} If the genesis is not the pinned one or an entry does not extend its predecessor.
   * @throws {TrustBaseSignatureError} If an entry is not signed by a quorum of its predecessor.
   */
  public static async fromBundle(bundle: TrustBaseBundle, genesisPin: Uint8Array): Promise<TrustBaseHistory> {
    const history = TrustBaseHistory.create(genesisPin);
    for (const entry of bundle.entries) {
      await history.append(entry);
    }
    return history;
  }

  /**
   * Add an entry.
   *
   * @param {RootTrustBaseV2} entry Decoded entry.
   * @returns {Promise<TrustBaseAppendOutcome>} `appended`, or `noop` when the entry is already held.
   * @throws {TrustBaseInvalidError} If the first entry is not a genesis entry.
   * @throws {TrustBaseChainError} If the first entry is not the pinned genesis, or the entry does not extend the tip (or its held predecessor).
   * @throws {TrustBaseSignatureError} If the predecessor's members did not sign it with a quorum.
   * @throws {TrustBaseConflictError} If a different entry is held for the epoch.
   * @throws {TrustBaseGapError} If the entry is more than one epoch ahead of the tip.
   */
  public append(entry: RootTrustBaseV2): Promise<TrustBaseAppendOutcome> {
    const result = this._queue.then(() => this.appendNow(entry));
    // A failed append must not stop the next one.
    this._queue = result.catch(() => undefined);
    return result;
  }

  /**
   * The held entry of an epoch.
   *
   * @param {bigint} epoch Epoch.
   * @returns {RootTrustBaseV2|null} The entry, or null when the epoch is before the genesis or after the tip (the caller may fetch and append).
   */
  public entryForEpoch(epoch: bigint): RootTrustBaseV2 | null {
    const first = this._entries[0];
    if (first === undefined || epoch < first.epoch) {
      return null;
    }
    return this._entries[Number(epoch - first.epoch)] ?? null;
  }

  /**
   * The round at which the held successor of an epoch starts, which ends the epoch's interval.
   *
   * @param {bigint} epoch Epoch.
   * @returns {bigint|null} Start round of the entry for `epoch + 1`, or null when none is held (the epoch is open-ended as far as this history knows).
   */
  public epochEndRound(epoch: bigint): bigint | null {
    return this.entryForEpoch(epoch + 1n)?.epochStartRound ?? null;
  }

  /**
   * The held entries as one complete bundle (tag 39015), the form a cache stores. Round-trips through {@link TrustBaseBundle.decode}.
   *
   * @returns {Promise<Uint8Array>} Tagged bundle.
   * @throws {TrustBaseBundleError} If the history is empty.
   */
  public toBundle(): Promise<Uint8Array> {
    // A copy: appends may run while the entry ids are computed.
    return TrustBaseBundle.encode(this.entries);
  }

  private async appendNow(entry: RootTrustBaseV2): Promise<TrustBaseAppendOutcome> {
    const first = this._entries[0];
    const tip = this._entries[this._entries.length - 1];
    if (first === undefined || tip === undefined) {
      entry.verifyGenesis();
      if (!areUint8ArraysEqual(await entry.entryId(), this._genesisPin)) {
        throw new TrustBaseChainError('The genesis is not the pinned identity.');
      }
      this._entries.push(entry);
      return 'appended';
    }

    if (entry.epoch <= tip.epoch) {
      if (entry.epoch < first.epoch) {
        throw new TrustBaseBeforeGenesisError(`Epoch ${entry.epoch} is before the genesis epoch ${first.epoch}.`);
      }
      const index = Number(entry.epoch - first.epoch);
      const heldId = await this._entries[index].entryId();
      const offeredId = await entry.entryId();
      if (!areUint8ArraysEqual(heldId, offeredId)) {
        // Different, but not authenticated: the caller that wants to know whether it is a fork verifies the entry against the predecessor.
        throw new TrustBaseConflictError(entry.epoch, `A different entry is held for epoch ${entry.epoch}.`, {
          authenticated: false,
          epoch: entry.epoch,
          heldEntry: null,
          heldEntryId: heldId,
          network: entry.networkId.id,
          offeredEntry: null,
          offeredEntryId: offeredId,
        });
      }
      if (index > 0) {
        await entry.verifySuccessor(this._entries[index - 1]);
      }
      return 'noop';
    }

    if (entry.epoch > tip.epoch + 1n) {
      throw new TrustBaseGapError(entry.epoch, tip.epoch, `Epoch ${entry.epoch} is ahead of the tip ${tip.epoch}.`);
    }

    await entry.verifySuccessor(tip);
    this._entries.push(entry);
    return 'appended';
  }
}
