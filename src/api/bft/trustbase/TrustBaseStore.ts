import { sha256 } from '@noble/hashes/sha2.js';

import { TrustBaseStoreError } from './TrustBaseError.js';
import { HexConverter } from '../../../util/HexConverter.js';
import { NetworkId } from '../../NetworkId.js';

/** What a store holds under a key: the complete bundle bytes and the opaque revision they were read at. */
export interface IStoredTrustBase {
  readonly bytes: Uint8Array;
  /** Opaque token bound to the read contents (a digest of them suffices). Not authentication. */
  readonly revision: string;
}

/**
 * Where a session keeps its one complete bundle per key. The core ships only {@link MemoryTrustBaseStore}; the application picks a durable backend
 * (the Node file adapter, an IndexedDB transaction). `compareAndSwap` must be atomic across every tab or process that shares the key: a
 * plain get-then-set does not qualify.
 */
export interface ITrustBaseStore {
  /**
   * Replace the value only if it still is at `expectedRevision` (`null`: the key must still be absent).
   *
   * @param {string} key Key.
   * @param {string|null} expectedRevision Revision read before, or null for absent.
   * @param {Uint8Array} bytes Complete bundle to store.
   * @returns {Promise<'written'|'changed'>} `written`, or `changed` when the key is not at the expected revision.
   * @throws {TrustBaseStoreError} On an I/O failure.
   */
  compareAndSwap(key: string, expectedRevision: string | null, bytes: Uint8Array): Promise<'changed' | 'written'>;

  /**
   * A coherent snapshot of the key.
   *
   * @param {string} key Key.
   * @param {number} maxBytes Budget, enforced before the value is allocated.
   * @returns {Promise<IStoredTrustBase|null>} The value, or null when absent.
   * @throws {TrustBaseStoreError} With reason `oversize` when the value exceeds the budget, otherwise on an I/O failure.
   */
  read(key: string, maxBytes: number): Promise<IStoredTrustBase | null>;
}

/** The trust namespace of the built-in release table. A private or test authority must use another one. */
export const PUBLIC_NAMESPACE = 'public';

/** Namespace of a local or test network opened from its own bundle ({@link TrustBaseSession.openLocal}): never shared with the public one. */
export const LOCAL_NAMESPACE = 'local';

/**
 * The key a session stores under: version, network, authenticated genesis entry id and trust namespace. Never the endpoint, the current tip or the
 * SDK version, so a pin bump finds the old cache. The application adds its own user scope.
 *
 * @param {NetworkId} network Network.
 * @param {Uint8Array} genesisEntryId Entry id of the genesis.
 * @param {string} namespace {@link PUBLIC_NAMESPACE} or an explicit custom one.
 * @returns {string} Key.
 */
export function trustBaseCacheKey(network: NetworkId, genesisEntryId: Uint8Array, namespace: string): string {
  return `utb/v1/${network.id}/${HexConverter.encode(genesisEntryId)}/${namespace}`;
}

/**
 * The revision token of stored bytes: the lowercase hex SHA-256. Returning to identical bytes returns to the same revision, which is harmless for
 * this contract.
 *
 * @param {Uint8Array} bytes Stored bytes.
 * @returns {string} Revision.
 */
export function trustBaseRevision(bytes: Uint8Array): string {
  return HexConverter.encode(sha256(bytes));
}

/** The reference store: a map in memory, with the same contract as any other. */
export class MemoryTrustBaseStore implements ITrustBaseStore {
  private readonly _values = new Map<string, Uint8Array>();

  /** @inheritDoc */
  public compareAndSwap(
    key: string,
    expectedRevision: string | null,
    bytes: Uint8Array,
  ): Promise<'changed' | 'written'> {
    const held = this._values.get(key);
    // No await between the comparison and the replacement: the swap is atomic.
    if ((held === undefined ? null : trustBaseRevision(held)) !== expectedRevision) {
      return Promise.resolve('changed');
    }
    this._values.set(key, new Uint8Array(bytes));
    return Promise.resolve('written');
  }

  /** @inheritDoc */
  public read(key: string, maxBytes: number): Promise<IStoredTrustBase | null> {
    const held = this._values.get(key);
    if (held === undefined) {
      return Promise.resolve(null);
    }
    if (held.length > maxBytes) {
      return Promise.reject(
        new TrustBaseStoreError('oversize', `${held.length} bytes exceed the budget of ${maxBytes}.`),
      );
    }
    return Promise.resolve({ bytes: new Uint8Array(held), revision: trustBaseRevision(held) });
  }
}
