import { sha256 } from '@noble/hashes/sha2.js';

import { RELEASE_PIN_ROWS } from './ReleasePins.generated.js';
import { ITrustBaseBundleLimits, TrustBaseBundle } from './TrustBaseBundle.js';
import {
  ReleasePinInvalidError,
  TrustBaseError,
  TrustBasePinMismatchError,
  UnknownNetworkError,
} from './TrustBaseError.js';
import { TrustBaseHistory } from './TrustBaseHistory.js';
import { HexConverter } from '../../../util/HexConverter.js';
import { areUint8ArraysEqual } from '../../../util/TypedArrayUtils.js';
import { NetworkId } from '../../NetworkId.js';

/**
 * Initial load budget of a bundle (a release's, a cache's): 16 MiB, 4,096 entries, and the 128 KiB per entry of {@link TrustBaseBundle}. It is
 * resource policy, not a trust rule: an application may configure more or less, and nothing is pruned to fit.
 */
export const TRUST_BASE_BUNDLE_LIMITS: ITrustBaseBundleLimits = {
  maxBytes: 16 * 1024 * 1024,
  maxEntries: 4096,
  maxEntryBytes: 128 * 1024,
};

/**
 * A release pin: the complete trust-base history of a network from its genesis to exactly the pinned release tip, and the identities that bind it.
 * It comes from the authenticated software release (or, for a private network, from the application's own configuration), never from a digest
 * shipped beside an untrusted download.
 */
export interface IReleasePin {
  /** SHA-256 of {@link embeddedBundle}. Not the entry id. */
  readonly bundleSha256: Uint8Array;
  /** The complete bundle, genesis to the pinned tip. */
  readonly embeddedBundle: Uint8Array;
  /** Entry id of the genesis entry. */
  readonly genesisEntryId: Uint8Array;
  readonly genesisEpoch: bigint;
  readonly networkId: NetworkId;
  /** Entry id of the release tip. */
  readonly pinnedEntryId: Uint8Array;
  readonly pinnedEpoch: bigint;
}

/**
 * A pin that has been verified: structure, every predecessor signature, both ids, epochs and digest. Holds copies, so the pin the caller passed can
 * change afterwards without effect.
 */
export class VerifiedReleasePin {
  private constructor(
    public readonly pin: IReleasePin,
    private readonly _ids: Uint8Array[],
  ) {}

  /** @returns {bigint} The pinned epoch. */
  public get pinnedEpoch(): bigint {
    return this.pin.pinnedEpoch;
  }

  /**
   * Verify a pin and build the history it embeds.
   *
   * @param {IReleasePin} pin The pin.
   * @param {ITrustBaseBundleLimits} [limits] Budget of the embedded bundle.
   * @returns {Promise<{verified: VerifiedReleasePin, history: TrustBaseHistory}>} The verified pin and a fresh history holding its entries.
   * @throws {ReleasePinInvalidError} If anything about the pin does not hold.
   */
  public static async verify(
    pin: IReleasePin,
    limits: ITrustBaseBundleLimits = TRUST_BASE_BUNDLE_LIMITS,
  ): Promise<{ history: TrustBaseHistory; verified: VerifiedReleasePin }> {
    const copy: IReleasePin = {
      bundleSha256: new Uint8Array(pin.bundleSha256),
      embeddedBundle: new Uint8Array(pin.embeddedBundle),
      genesisEntryId: new Uint8Array(pin.genesisEntryId),
      genesisEpoch: pin.genesisEpoch,
      networkId: pin.networkId,
      pinnedEntryId: new Uint8Array(pin.pinnedEntryId),
      pinnedEpoch: pin.pinnedEpoch,
    };
    try {
      if (!areUint8ArraysEqual(sha256(copy.embeddedBundle), copy.bundleSha256)) {
        throw new ReleasePinInvalidError('The bundle digest does not match.');
      }
      const bundle = await TrustBaseBundle.decode(copy.embeddedBundle, limits);
      if (!bundle.networkId.equals(copy.networkId)) {
        throw new ReleasePinInvalidError(
          `The bundle is of network ${bundle.networkId.id}, the pin of ${copy.networkId.id}.`,
        );
      }
      const entries = bundle.entries;
      if (entries[0].epoch !== copy.genesisEpoch) {
        throw new ReleasePinInvalidError(
          `The bundle starts at epoch ${entries[0].epoch}, the pin says ${copy.genesisEpoch}.`,
        );
      }
      // Strict: the genesis against its pinned id, every successor against its predecessor's quorum.
      const history = await TrustBaseHistory.fromBundle(bundle, copy.genesisEntryId);
      const ids = await Promise.all(entries.map((entry) => entry.entryId()));
      const tip = entries[entries.length - 1];
      if (tip.epoch !== copy.pinnedEpoch || !areUint8ArraysEqual(ids[ids.length - 1], copy.pinnedEntryId)) {
        throw new ReleasePinInvalidError('The bundle does not end at the pinned epoch and entry id.');
      }
      return { history, verified: new VerifiedReleasePin(copy, ids) };
    } catch (error) {
      if (error instanceof ReleasePinInvalidError) {
        throw error;
      }
      if (error instanceof TrustBaseError) {
        throw new ReleasePinInvalidError(`The embedded bundle is invalid: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }

  /** @returns {Uint8Array|null} Copy of the entry id of the checkpoint at `epoch`, or null outside the pinned history. */
  public idAt(epoch: bigint): Uint8Array | null {
    const id = this._ids[Number(epoch - this.pin.genesisEpoch)];
    return epoch < this.pin.genesisEpoch || id === undefined ? null : new Uint8Array(id);
  }

  /**
   * Whether `candidate` is a continuation of this pin: the same network and genesis, containing this checkpoint at this epoch, at an equal or later
   * pinned epoch.
   *
   * @param {VerifiedReleasePin} candidate Verified candidate.
   * @returns {boolean} True if the candidate extends this pin.
   */
  public isExtendedBy(candidate: VerifiedReleasePin): boolean {
    const id = candidate.idAt(this.pin.pinnedEpoch);
    return (
      candidate.pin.networkId.equals(this.pin.networkId) &&
      id !== null &&
      areUint8ArraysEqual(id, this.pin.pinnedEntryId)
    );
  }
}

/**
 * The release table of this SDK build, one row per public network: mainnet (1) and testnet2 (4), each the complete history from its genesis to the
 * pinned release tip. The rows are generated (`scripts/release-pins/generate.mjs`, from `release-pins/manifest.json` and the bundles it names, with
 * a CI check that regeneration leaves no diff) and are verified again, strictly, when a session opens. The network of the old testnet 2 has no row.
 */
export const RELEASE_PINS: readonly IReleasePin[] = RELEASE_PIN_ROWS.map((row) => ({
  bundleSha256: HexConverter.decode(row.bundleSha256),
  embeddedBundle: HexConverter.decode(row.bundleHex),
  genesisEntryId: HexConverter.decode(row.genesisEntryId),
  genesisEpoch: BigInt(row.genesisEpoch),
  networkId: NetworkId.fromId(row.networkId),
  pinnedEntryId: HexConverter.decode(row.pinnedEntryId),
  pinnedEpoch: BigInt(row.pinnedEpoch),
}));

/**
 * The pin of a local or test network, derived from that deployment's own GetTrustBase bundle (genesis to tip): the network, the genesis and tip
 * epochs and entry ids and the digest all come from the bundle. This trusts the bundle you pass (you got it from your own deployment); it checks
 * it strictly all the same, and it is not a release lineage check. Use it with {@link TrustBaseSession.openLocal}, which keeps the cache of a
 * local network apart from every public one.
 *
 * @param {Uint8Array} bundle Complete bundle bytes (tag 39015, status OK, from the genesis entry, no continuation cursor).
 * @param {ITrustBaseBundleLimits} [limits] Budget of the bundle.
 * @returns {Promise<IReleasePin>} The pin.
 * @throws {ReleasePinInvalidError} If the bundle is not a complete, internally valid history.
 */
export async function releasePinFromBundle(
  bundle: Uint8Array,
  limits: ITrustBaseBundleLimits = TRUST_BASE_BUNDLE_LIMITS,
): Promise<IReleasePin> {
  const embeddedBundle = new Uint8Array(bundle);
  let decoded: TrustBaseBundle;
  try {
    decoded = await TrustBaseBundle.decode(embeddedBundle, limits);
  } catch (error) {
    if (error instanceof TrustBaseError) {
      throw new ReleasePinInvalidError(`The bundle is not a complete trust-base history: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
  const first = decoded.entries[0];
  const tip = decoded.entries[decoded.entries.length - 1];
  return {
    bundleSha256: sha256(embeddedBundle),
    embeddedBundle,
    genesisEntryId: await first.entryId(),
    genesisEpoch: first.epoch,
    networkId: decoded.networkId,
    pinnedEntryId: await tip.entryId(),
    pinnedEpoch: tip.epoch,
  };
}

/**
 * Select and verify the pin of a public network: the table row, optionally replaced by an override that extends it.
 *
 * @param {NetworkId} network Network.
 * @param {readonly IReleasePin[]} table Release table.
 * @param {IReleasePin|undefined} override Explicit pin that must extend the built-in row.
 * @param {ITrustBaseBundleLimits} limits Budget.
 * @returns {Promise<{verified: VerifiedReleasePin, history: TrustBaseHistory}>} The pin to use and a history holding it.
 * @throws {UnknownNetworkError} If the network has no row.
 * @throws {ReleasePinInvalidError} If the row or the override is invalid.
 * @throws {TrustBasePinMismatchError} If the override does not extend the row.
 */
export async function selectPublicPin(
  network: NetworkId,
  table: readonly IReleasePin[],
  override: IReleasePin | undefined,
  limits: ITrustBaseBundleLimits,
): Promise<{ history: TrustBaseHistory; verified: VerifiedReleasePin }> {
  const row = table.find((candidate) => candidate.networkId.equals(network));
  if (row === undefined) {
    throw new UnknownNetworkError(`No release pin for network ${network.id}.`);
  }
  const builtin = await VerifiedReleasePin.verify(row, limits);
  if (override === undefined) {
    return builtin;
  }
  const replacement = await VerifiedReleasePin.verify(override, limits);
  if (!builtin.verified.isExtendedBy(replacement.verified)) {
    throw new TrustBasePinMismatchError('The override does not extend the release pin of the network.');
  }
  return replacement;
}
