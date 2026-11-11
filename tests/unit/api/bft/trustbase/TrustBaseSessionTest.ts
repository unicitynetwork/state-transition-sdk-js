import { buildChain, buildPin } from './TrustBaseTestUtils.js';
import { IReleasePin } from '../../../../../src/api/bft/trustbase/ReleasePin.js';
import { RootTrustBaseV2 } from '../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseBundle } from '../../../../../src/api/bft/trustbase/TrustBaseBundle.js';
import {
  CacheContendedError,
  HistoryConflictedError,
  ReleasePinInvalidError,
  TrustBaseBundleError,
  TrustBaseChainError,
  TrustBaseConflictError,
  TrustBaseGapError,
  TrustBasePinMismatchError,
  TrustBaseSignatureError,
  TrustBaseStoreError,
  TrustBaseUpdateError,
  UnknownNetworkError,
} from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseHistory } from '../../../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { encodeTrustBaseResponse } from '../../../../../src/api/bft/trustbase/TrustBaseResponseWire.js';
import { TrustBaseSession } from '../../../../../src/api/bft/trustbase/TrustBaseSession.js';
import {
  ITrustBaseStore,
  MemoryTrustBaseStore,
  trustBaseCacheKey,
  trustBaseRevision,
} from '../../../../../src/api/bft/trustbase/TrustBaseStore.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

const NS = 'test-authority';
const LIMITS = { maxBytes: 16 * 1024 * 1024, maxEntries: 4096 };

function ids(entries: readonly RootTrustBaseV2[]): Promise<string[]> {
  return Promise.all(entries.map(async (entry) => HexConverter.encode(await entry.entryId())));
}

function bundleOf(entries: readonly RootTrustBaseV2[]): Promise<Uint8Array> {
  return TrustBaseBundle.encode(entries);
}

function keyOf(pin: IReleasePin): string {
  return trustBaseCacheKey(pin.networkId, pin.genesisEntryId, NS);
}

async function stored(store: ITrustBaseStore, pin: IReleasePin): Promise<RootTrustBaseV2[]> {
  const read = await store.read(keyOf(pin), LIMITS.maxBytes);
  return read === null ? [] : (await TrustBaseBundle.decode(read.bytes, LIMITS)).entries;
}

/** A store that can fail, change under the session, or count writes. */
class TestStore extends MemoryTrustBaseStore {
  public alwaysChanged = false;
  public beforeSwap: (() => Promise<void>) | null = null;
  public failRead: Error | null = null;
  public failSwap: Error | null = null;
  public swaps = 0;

  public override async compareAndSwap(
    key: string,
    expected: string | null,
    bytes: Uint8Array,
  ): Promise<'changed' | 'written'> {
    this.swaps++;
    if (this.failSwap !== null) {
      throw this.failSwap;
    }
    if (this.beforeSwap !== null) {
      const hook = this.beforeSwap;
      this.beforeSwap = null;
      await hook();
    }
    return this.alwaysChanged ? 'changed' : super.compareAndSwap(key, expected, bytes);
  }

  public override read(key: string, maxBytes: number): ReturnType<MemoryTrustBaseStore['read']> {
    if (this.failRead !== null) {
      return Promise.reject(this.failRead);
    }
    return super.read(key, maxBytes);
  }

  public async seed(key: string, bytes: Uint8Array): Promise<void> {
    await super.compareAndSwap(key, null, bytes);
  }
}

describe('TrustBaseSession', () => {
  let chain: RootTrustBaseV2[];
  let fork: RootTrustBaseV2[];
  let pin: IReleasePin;

  beforeAll(async () => {
    chain = await buildChain(8);
    fork = await buildChain(8, { forkAt: 5, tag: 0xe1 });
    pin = await buildPin(chain, 4);
  });

  const open = (
    store: ITrustBaseStore,
    p: IReleasePin = pin,
    options = {},
  ): ReturnType<typeof TrustBaseSession.openPrivate> => TrustBaseSession.openPrivate(NS, p, store, options);

  describe('pins', () => {
    it('has no public pin in the release table', async () => {
      await expect(TrustBaseSession.openPublic(pin.networkId, new MemoryTrustBaseStore())).rejects.toBeInstanceOf(
        UnknownNetworkError,
      );
    });

    it('refuses an invalid embedded pin, whatever the cache holds', async () => {
      const store = new TestStore();
      await store.seed(keyOf(pin), await bundleOf(chain));
      const bad: IReleasePin[] = [
        { ...pin, bundleSha256: new Uint8Array(32) },
        { ...pin, pinnedEntryId: new Uint8Array(32).fill(1) },
        { ...pin, genesisEntryId: new Uint8Array(32).fill(1) },
        { ...pin, pinnedEpoch: pin.pinnedEpoch + 1n },
        { ...pin, genesisEpoch: pin.genesisEpoch + 1n },
      ];
      for (const candidate of bad) {
        await expect(open(store, candidate)).rejects.toBeInstanceOf(ReleasePinInvalidError);
      }
    });

    it('refuses an embedded bundle whose successor is not signed by a quorum', async () => {
      const weak = await buildChain(4, { signers: (index) => (index === 2 ? ['a', 'b'] : ['a', 'b', 'c']) });
      const bundle = await bundleOf(weak);
      const weakPin: IReleasePin = {
        ...(await buildPin(weak.slice(0, 1), 1)),
        bundleSha256: await buildPinDigest(bundle),
        embeddedBundle: bundle,
        pinnedEntryId: await weak[3].entryId(),
        pinnedEpoch: weak[3].epoch,
      };
      await expect(open(new MemoryTrustBaseStore(), weakPin)).rejects.toBeInstanceOf(ReleasePinInvalidError);
    });

    it('copies the pin: changing the caller bytes while it is verified changes nothing', async () => {
      const mine = await buildPin(chain, 4);
      const opening = open(new MemoryTrustBaseStore(), mine);
      mine.embeddedBundle.fill(0);
      mine.pinnedEntryId.fill(0);
      const { session } = await opening;
      expect(session.history.tip?.epoch).toBe(chain[3].epoch);
    });

    it('needs its own namespace for a private authority', async () => {
      for (const namespace of ['public', '', 'a/b', 'x'.repeat(65)]) {
        await expect(TrustBaseSession.openPrivate(namespace, pin, new MemoryTrustBaseStore())).rejects.toThrow(
          RangeError,
        );
      }
    });

    it('keys the cache by version, network, genesis id and namespace', async () => {
      const { session } = await open(new MemoryTrustBaseStore());
      expect(session.key).toBe(`utb/v1/${pin.networkId.id}/${HexConverter.encode(pin.genesisEntryId)}/${NS}`);
    });

    describe('public table', () => {
      it('uses the row, and accepts an override that extends it', async () => {
        const longer = await buildPin(chain, 6);
        const { session } = await TrustBaseSession.openPublic(pin.networkId, new MemoryTrustBaseStore(), {
          override: longer,
          table: [pin],
        });
        expect(session.history.tip?.epoch).toBe(chain[5].epoch);
        const plain = await TrustBaseSession.openPublic(pin.networkId, new MemoryTrustBaseStore(), { table: [pin] });
        expect(plain.session.history.tip?.epoch).toBe(chain[3].epoch);
        expect(plain.session.key.endsWith('/public')).toBe(true);
      });

      it('refuses an older or conflicting override', async () => {
        const older = await buildPin(chain, 2);
        const other = await buildPin(await buildChain(8, { forkAt: 3, tag: 0xe3 }), 8);
        const unrelated = await buildPin(await buildChain(6, { forkAt: 2, tag: 0xe2 }), 6);
        for (const override of [older, other, unrelated]) {
          await expect(
            TrustBaseSession.openPublic(pin.networkId, new MemoryTrustBaseStore(), { override, table: [pin] }),
          ).rejects.toBeInstanceOf(TrustBasePinMismatchError);
        }
      });

      it('refuses an invalid row', async () => {
        await expect(
          TrustBaseSession.openPublic(pin.networkId, new MemoryTrustBaseStore(), {
            table: [{ ...pin, bundleSha256: new Uint8Array(32) }],
          }),
        ).rejects.toBeInstanceOf(ReleasePinInvalidError);
      });
    });
  });

  describe('open', () => {
    it('starts from the pinned history when there is no cache, and does not write', async () => {
      const store = new TestStore();
      const { diagnostics, session } = await open(store);
      expect(diagnostics).toEqual([]);
      expect(session.history.tip?.epoch).toBe(chain[3].epoch);
      expect(session.dirty).toBe(false);
      expect(store.swaps).toBe(0);
      await expect(session.flush()).resolves.toMatchObject({ status: 'saved' });
      expect(store.swaps).toBe(0);
    });

    it.each([
      ['shorter', 2, true, 3],
      ['equal', 4, false, 3],
      ['longer', 6, false, 5],
    ])('merges a %s cache', async (_name, length, dirty, tipIndex) => {
      const store = new TestStore();
      await store.seed(keyOf(pin), await bundleOf(chain.slice(0, length)));
      const { diagnostics, session } = await open(store);
      expect(diagnostics).toEqual([]);
      expect(await ids(session.history.entries)).toEqual(await ids(chain.slice(0, tipIndex + 1)));
      expect(session.dirty).toBe(dirty);
      expect(store.swaps).toBe(0);
    });

    it('upgrades a shorter cache on flush without fetching, and keeps a longer suffix across a pin bump', async () => {
      const store = new TestStore();
      await store.seed(keyOf(pin), await bundleOf(chain.slice(0, 2)));
      const first = await open(store);
      await expect(first.session.flush()).resolves.toMatchObject({ status: 'saved' });
      expect(await ids(await stored(store, pin))).toEqual(await ids(chain.slice(0, 4)));

      // An older SDK (the 4-entry pin) meeting a newer 7-entry cache must not truncate it.
      await store.compareAndSwap(
        keyOf(pin),
        trustBaseRevision(await bundleOf(chain.slice(0, 4))),
        await bundleOf(chain.slice(0, 7)),
      );
      const older = await open(store);
      expect(older.session.history.tip?.epoch).toBe(chain[6].epoch);
      await older.session.flush();
      expect(await stored(store, pin)).toHaveLength(7);
    });

    it('rejects a cache that disagrees with the checkpoint and never overwrites it', async () => {
      const divergent = await buildChain(7, { forkAt: 2, tag: 0xd1 });
      const theirs = await bundleOf(divergent);
      const store = new TestStore();
      await store.seed(keyOf(pin), theirs);
      const { diagnostics, session } = await open(store);
      expect(diagnostics.map((d) => (d.code === 'CacheRejected' ? `${d.code}:${d.reason}` : d.code))).toEqual([
        'CacheRejected:pinMismatch',
      ]);
      expect(await ids(session.history.entries)).toEqual(await ids(chain.slice(0, 4)));
      expect(session.dirty).toBe(false);
      // Held back, clean or dirty: the authenticated history in the store is evidence, not damage.
      expect(await session.flush()).toMatchObject({ status: 'pending' });
      await session.append(chain[4]);
      const result = await session.flush();
      expect(result).toMatchObject({ status: 'pending' });
      expect((result as { error: unknown }).error).toBeInstanceOf(TrustBasePinMismatchError);
      expect(store.swaps).toBe(0);
      expect((await store.read(keyOf(pin), LIMITS.maxBytes))?.bytes).toEqual(theirs);
    });

    it('rejects a cache that is not a valid history, with the reason', async () => {
      const good = await bundleOf(chain.slice(0, 6));
      const otherNetwork = await buildChain(5, { network: 9n });
      const otherGenesis = await buildChain(5, { forkAt: 0, tag: 0xd2 });
      const weak = await buildChain(6, { signers: (index) => (index === 5 ? ['a'] : ['a', 'b', 'c']) });
      const tampered = new Uint8Array(good);
      tampered[tampered.length - 5] ^= 0xff;
      const cases: [string, Uint8Array, string][] = [
        ['truncated', good.slice(0, good.length - 10), 'malformed'],
        ['corrupt', tampered, 'malformed'],
        ['empty', new Uint8Array(0), 'malformed'],
        ['garbage', new Uint8Array([1, 2, 3]), 'malformed'],
        ['partial range', await partialBundle(chain.slice(1, 6)), 'malformed'],
        ['wrong network', await bundleOf(otherNetwork), 'wrongNetwork'],
        ['wrong genesis', await bundleOf(otherGenesis), 'wrongGenesis'],
        ['unsigned successor', await bundleOf(weak), 'malformed'],
        ['null end id', await nullEndBundle(chain.slice(0, 6)), 'malformed'],
        ['cursor', await cursorBundle(chain.slice(0, 6)), 'malformed'],
      ];
      for (const [name, bytes, reason] of cases) {
        const store = new TestStore();
        await store.seed(keyOf(pin), bytes);
        const { diagnostics, session } = await open(store);
        expect([name, diagnostics.map((d) => (d.code === 'CacheRejected' ? d.reason : d.code))]).toEqual([
          name,
          [reason],
        ]);
        expect(session.history.tip?.epoch).toBe(chain[3].epoch);
        expect(session.dirty).toBe(false);
        await expect(session.flush()).resolves.toMatchObject({ status: 'saved' });
        expect(await ids(await stored(store, pin))).toEqual(await ids(chain.slice(0, 4)));
      }
    });

    it('reports an oversize cache and never replaces it', async () => {
      const store = new TestStore();
      const theirs = await bundleOf(chain.slice(0, 6));
      await store.seed(keyOf(pin), theirs);
      const { diagnostics, session } = await open(store, pin, { limits: { maxBytes: 2000, maxEntries: 4096 } });
      expect(diagnostics.map((d) => (d.code === 'CacheRejected' ? d.reason : d.code))).toEqual(['oversize']);
      expect(session.dirty).toBe(false);
      await session.append(chain[4]);
      expect(await session.flush()).toMatchObject({ status: 'pending' });
      expect((await store.read(keyOf(pin), LIMITS.maxBytes))?.bytes).toEqual(theirs);
    });

    it('treats a valid history over the entry budget as oversize, not as damage, and never rewrites it shorter', async () => {
      const store = new TestStore();
      const theirs = await bundleOf(chain);
      await store.seed(keyOf(pin), theirs);
      const { diagnostics, session } = await open(store, pin, { limits: { maxBytes: 1 << 20, maxEntries: 6 } });
      expect(diagnostics.map((d) => (d.code === 'CacheRejected' ? d.reason : d.code))).toEqual(['oversize']);
      expect(session.history.tip?.epoch).toBe(chain[3].epoch);
      await session.append(chain[4]);
      expect(await session.flush()).toMatchObject({ status: 'pending' });
      expect((await store.read(keyOf(pin), LIMITS.maxBytes))?.bytes).toEqual(theirs);
    });

    it('judges the byte budget itself when the store does not enforce it', async () => {
      const store = new (class extends TestStore {
        public override read(key: string): ReturnType<MemoryTrustBaseStore['read']> {
          return super.read(key, Number.MAX_SAFE_INTEGER);
        }
      })();
      await store.seed(keyOf(pin), await bundleOf(chain.slice(0, 6)));
      const { diagnostics } = await open(store, pin, { limits: { maxBytes: 2000, maxEntries: 4096 } });
      expect(diagnostics.map((d) => (d.code === 'CacheRejected' ? d.reason : d.code))).toEqual(['oversize']);
    });

    it('keeps an oversize store blocked on a clean flush too', async () => {
      const store = new TestStore();
      store.failRead = new TrustBaseStoreError('oversize', 'too big');
      const { diagnostics, session } = await open(store);
      expect(diagnostics.map((d) => (d.code === 'CacheRejected' ? d.reason : d.code))).toEqual(['oversize']);
      expect(await session.flush()).toMatchObject({ status: 'pending' });
      expect(store.swaps).toBe(0);
    });

    it('applies the per-entry budget to the embedded pin as well', async () => {
      await expect(
        open(new TestStore(), pin, { limits: { maxBytes: 1 << 20, maxEntries: 4096, maxEntryBytes: 100 } }),
      ).rejects.toBeInstanceOf(ReleasePinInvalidError);
    });

    it('reports an unreadable store and falls back', async () => {
      const store = new TestStore();
      store.failRead = new TrustBaseStoreError('permission', 'denied');
      const { diagnostics, session } = await open(store);
      expect(diagnostics.map((d) => d.code)).toEqual(['CacheUnavailable']);
      expect(session.history.tip?.epoch).toBe(chain[3].epoch);
      expect(session.dirty).toBe(false);
    });

    it('revalidates strictly: a cache with the right entry ids but a bad witness is refused', async () => {
      // Same entries (same ids), but epoch 3 signed by only one member.
      const weak = await buildChain(6, { signers: (index) => (index === 3 ? ['b'] : ['a', 'b', 'c']) });
      expect(await ids(weak)).toEqual(await ids(chain.slice(0, 6)));
      const store = new TestStore();
      await store.seed(keyOf(pin), await bundleOf(weak));
      const { diagnostics } = await open(store);
      expect(diagnostics.map((d) => (d.code === 'CacheRejected' ? d.reason : d.code))).toEqual(['malformed']);
    });

    it('keeps the first held witness when the cache has another valid one for the same entry id', async () => {
      const other = await buildChain(6, { signers: ['a', 'b', 'd'] });
      expect(await ids(other)).toEqual(await ids(chain.slice(0, 6)));
      const store = new TestStore();
      await store.seed(keyOf(pin), await bundleOf(other));
      const { diagnostics, session } = await open(store);
      expect(diagnostics).toEqual([]);
      expect(session.dirty).toBe(false);
      const held = session.history.entryForEpoch(chain[1].epoch);
      expect([...(held?.signatures?.keys() ?? [])]).toEqual([...(chain[1].signatures?.keys() ?? [])]);
    });

    it('does not publish anything from a cancelled open', async () => {
      const store = new TestStore();
      await store.seed(keyOf(pin), await bundleOf(chain.slice(0, 6)));
      const controller = new AbortController();
      controller.abort(new Error('stop'));
      await expect(open(store, pin, { signal: controller.signal })).rejects.toThrow('stop');
    });
  });

  describe('append', () => {
    it('appends the next entry, ignores a held one, refuses a gap', async () => {
      const { session } = await open(new TestStore());
      await expect(session.append(chain[3])).resolves.toBe('noop');
      expect(session.dirty).toBe(false);
      await expect(session.append(chain[5])).rejects.toBeInstanceOf(TrustBaseGapError);
      await expect(session.append(chain[4])).resolves.toBe('appended');
      expect(session.dirty).toBe(true);
    });

    it('refuses a different entry in the pinned prefix without closing the session', async () => {
      const { session } = await open(new TestStore());
      const divergent = await buildChain(5, { forkAt: 2, tag: 0xd3 });
      await expect(session.append(divergent[2])).rejects.toBeInstanceOf(TrustBasePinMismatchError);
      // The next entry of the divergent branch links to an entry this history does not hold: an ordinary refusal.
      await expect(session.append(divergent[3])).rejects.toBeInstanceOf(TrustBaseChainError);
      // Not signed by the held predecessor's quorum: also an ordinary refusal, not a pin mismatch.
      const unsigned = (await buildChain(3, { forkAt: 2, signers: ['a'], tag: 0xd4 }))[2];
      await expect(session.append(unsigned)).rejects.toBeInstanceOf(TrustBaseSignatureError);
      expect(session.conflict).toBeNull();
      await expect(session.append(chain[4])).resolves.toBe('appended');
    });

    it('refuses a different genesis as a pin mismatch: nothing can verify it, the checkpoint settles it', async () => {
      const { session } = await open(new TestStore());
      const otherGenesis = (await buildChain(2, { forkAt: 0, tag: 0xd8 }))[0];
      await expect(session.append(otherGenesis)).rejects.toBeInstanceOf(TrustBasePinMismatchError);
      expect(session.conflict).toBeNull();
    });

    it('does not close the session for a different entry that does not verify', async () => {
      const { session } = await open(new TestStore());
      await session.append(chain[4]);
      const forged = (await buildChain(6, { forkAt: 4, signers: ['a'], tag: 0xe4 }))[4];
      await expect(session.append(forged)).rejects.toBeInstanceOf(TrustBaseSignatureError);
      expect(session.conflict).toBeNull();
      const wrongLink = (await buildChain(7, { forkAt: 3, tag: 0xe5 }))[4];
      await expect(session.append(wrongLink)).rejects.toBeInstanceOf(TrustBaseChainError);
      expect(session.conflict).toBeNull();
      await expect(session.append(chain[5])).resolves.toBe('appended');
    });

    describe('after an authenticated fork past the checkpoint', () => {
      const conflicted = async (): Promise<{ error: unknown; session: TrustBaseSession; store: TestStore }> => {
        const store = new TestStore();
        const { session } = await open(store);
        await session.append(chain[4]);
        await session.append(chain[5]);
        const error: unknown = await session.append(fork[5]).catch((e: unknown) => e);
        return { error, session, store };
      };

      it('reports the evidence and closes the session', async () => {
        const { error, session } = await conflicted();
        expect(error).toBeInstanceOf(TrustBaseConflictError);
        const conflict = error as TrustBaseConflictError;
        expect(conflict.authenticated).toBe(true);
        expect(conflict.epoch).toBe(chain[5].epoch);
        expect(conflict.details).toMatchObject({ authenticated: true, network: Number(chain[5].networkId.id) });
        expect(conflict.details?.heldEntry).toEqual(chain[5].encode());
        expect(conflict.details?.offeredEntry).toEqual(fork[5].encode());
        expect(HexConverter.encode(conflict.details?.heldEntryId ?? new Uint8Array())).toBe((await ids([chain[5]]))[0]);
        expect(HexConverter.encode(conflict.details?.offeredEntryId ?? new Uint8Array())).toBe(
          (await ids([fork[5]]))[0],
        );
        expect(session.conflict).toBe(conflict);
      });

      it('fails every later append, refresh, flush and read, and keeps the held bytes', async () => {
        const { session, store } = await conflicted();
        const view = session.history;
        await expect(session.append(chain[6])).rejects.toBeInstanceOf(HistoryConflictedError);
        await expect(session.append(chain[5])).rejects.toBeInstanceOf(HistoryConflictedError);
        await expect(session.refresh([])).rejects.toBeInstanceOf(HistoryConflictedError);
        await expect(session.flush()).resolves.toMatchObject({ status: 'pending' });
        expect(() => view.tip).toThrow(HistoryConflictedError);
        expect(() => view.entryForEpoch(chain[2].epoch)).toThrow(HistoryConflictedError);
        expect(() => view.entries).toThrow(HistoryConflictedError);
        expect(store.swaps).toBe(0);
        // The evidence stays available.
        const exported = await TrustBaseBundle.decode(await session.exportBundle(), LIMITS);
        expect(await ids(exported.entries)).toEqual(await ids(chain.slice(0, 6)));
      });
    });

    it('serialises concurrent appends', async () => {
      const { session } = await open(new TestStore());
      const results = await Promise.allSettled([
        session.append(chain[4]),
        session.append(chain[5]),
        session.append(chain[6]),
      ]);
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
      expect(session.history.tip?.epoch).toBe(chain[6].epoch);
    });

    it('hands out snapshots that later appends cannot change', async () => {
      const { session } = await open(new TestStore());
      const before = session.history.entries;
      await session.append(chain[4]);
      expect(before).toHaveLength(4);
      before.pop();
      expect(session.history.entries).toHaveLength(5);
    });
  });

  describe('flush', () => {
    it('saves one complete bundle, once, and not again when nothing changed', async () => {
      const store = new TestStore();
      const { session } = await open(store);
      await session.append(chain[4]);
      await session.append(chain[5]);
      await expect(session.flush()).resolves.toMatchObject({ status: 'saved' });
      expect(store.swaps).toBe(1);
      expect(session.dirty).toBe(false);
      expect(await ids(await stored(store, pin))).toEqual(await ids(chain.slice(0, 6)));
      await session.flush();
      expect(store.swaps).toBe(1);

      // The next session finds exactly that.
      const again = await open(store);
      expect(again.session.history.tip?.epoch).toBe(chain[5].epoch);
      expect(again.session.dirty).toBe(false);
    });

    it('keeps the verified history and the dirty state when the write fails', async () => {
      const store = new TestStore();
      const { session } = await open(store);
      await session.append(chain[4]);
      store.failSwap = new TrustBaseStoreError('quota', 'full');
      const result = await session.flush();
      expect(result.status).toBe('pending');
      expect((result as { error: unknown }).error).toBeInstanceOf(TrustBaseStoreError);
      expect(session.dirty).toBe(true);
      expect(session.history.tip?.epoch).toBe(chain[4].epoch);
      store.failSwap = null;
      await expect(session.flush()).resolves.toMatchObject({ status: 'saved' });
    });

    it('does not write over a store it cannot read', async () => {
      const store = new TestStore();
      const { session } = await open(store);
      await session.append(chain[4]);
      store.failRead = new TrustBaseStoreError('io', 'broken');
      await expect(session.flush()).resolves.toMatchObject({ status: 'pending' });
      expect(store.swaps).toBe(0);
    });

    it('imports a compatible longer history another writer saved, and does not shorten it', async () => {
      const store = new TestStore();
      const { session } = await open(store);
      await session.append(chain[4]);
      await store.seed(keyOf(pin), await bundleOf(chain.slice(0, 7)));
      await expect(session.flush()).resolves.toMatchObject({ status: 'saved', wrote: false });
      expect(session.history.tip?.epoch).toBe(chain[6].epoch);
      expect(await stored(store, pin)).toHaveLength(7);
      // Nothing to write: the store already has everything held.
      expect(store.swaps).toBe(0);
    });

    it('merges two writers that advance compatibly in a race', async () => {
      const store = new TestStore();
      const { session } = await open(store);
      await session.append(chain[4]);
      // The other writer saves a longer history between this one's read and its swap.
      store.beforeSwap = async (): Promise<void> => {
        await store.seed(keyOf(pin), await bundleOf(chain.slice(0, 7)));
      };
      await expect(session.flush()).resolves.toMatchObject({ status: 'saved' });
      expect(await stored(store, pin)).toHaveLength(7);
      expect(session.history.tip?.epoch).toBe(chain[6].epoch);
    });

    it('never overwrites a competing authenticated branch: the session closes and the store keeps it', async () => {
      const store = new TestStore();
      const { session } = await open(store);
      await session.append(chain[4]);
      await session.append(chain[5]);
      const theirs = await bundleOf(fork.slice(0, 7));
      await store.seed(keyOf(pin), theirs);
      const result = await session.flush();
      expect(result).toMatchObject({ status: 'pending' });
      expect(session.conflict).toBeInstanceOf(TrustBaseConflictError);
      expect(session.conflict?.authenticated).toBe(true);
      expect((await store.read(keyOf(pin), LIMITS.maxBytes))?.bytes).toEqual(theirs);
    });

    it('replaces a malformed cache only at the revision it observed', async () => {
      const store = new TestStore();
      const key = keyOf(pin);
      await store.seed(key, new Uint8Array([9, 9, 9]));
      const { session } = await open(store);
      // Someone repairs it before the flush: their bytes are read again and kept.
      const theirs = await bundleOf(chain.slice(0, 6));
      store.beforeSwap = async (): Promise<void> => {
        await store.compareAndSwap(key, trustBaseRevision(new Uint8Array([9, 9, 9])), theirs);
      };
      await expect(session.flush()).resolves.toMatchObject({ status: 'saved' });
      expect(await stored(store, pin)).toHaveLength(6);
      expect(session.history.tip?.epoch).toBe(chain[5].epoch);
    });

    it('repairs a malformed cache, and says so', async () => {
      const store = new TestStore();
      await store.seed(keyOf(pin), new Uint8Array([9, 9, 9]));
      const { session } = await open(store);
      const result = await session.flush();
      expect(result).toMatchObject({ status: 'saved', wrote: true });
      expect((result as unknown as { diagnostics: unknown[] }).diagnostics).toMatchObject([
        { code: 'CacheRejected', reason: 'malformed' },
      ]);
      expect(await ids(await stored(store, pin))).toEqual(await ids(chain.slice(0, 4)));
      // Repaired: the next flush has nothing to do.
      await session.flush();
      expect(store.swaps).toBe(1);
    });

    it('gives up after one write and three retries', async () => {
      const store = new TestStore();
      const { session } = await open(store);
      await session.append(chain[4]);
      store.alwaysChanged = true;
      const result = await session.flush();
      expect(result).toMatchObject({ status: 'pending' });
      expect((result as { error: unknown }).error).toBeInstanceOf(CacheContendedError);
      expect(store.swaps).toBe(4);
      expect(session.dirty).toBe(true);
    });

    it('keeps an entry appended during the save dirty', async () => {
      const store = new TestStore();
      const { session } = await open(store);
      await session.append(chain[4]);
      store.beforeSwap = async (): Promise<void> => {
        // Runs inside the save: queue behind it, as any caller would.
        void session.append(chain[5]);
        await Promise.resolve();
      };
      await session.flush();
      await session.append(chain[5]).catch(() => undefined);
      expect(await stored(store, pin)).toHaveLength(5);
      expect(session.dirty).toBe(true);
      await session.flush();
      expect(await stored(store, pin)).toHaveLength(6);
    });
  });

  describe('refresh', () => {
    const page = (entries: RootTrustBaseV2[], from: bigint, end: bigint, endId: Uint8Array): Uint8Array =>
      encodeTrustBaseResponse({
        effectiveEnd: end,
        endEntryId: endId,
        entries: entries.map((e) => e.encode()),
        fromEpoch: from,
        network: pin.networkId.id,
        nextEpoch: null,
        status: 0n,
      });

    it('saves the valid prefix when a later page fails', async () => {
      const store = new TestStore();
      const { session } = await open(store);
      const first = chain[4];
      let calls = 0;
      const source = {
        getTrustBasePage: jest.fn((): Promise<Uint8Array> => {
          calls++;
          return calls === 1
            ? Promise.resolve(
                encodeTrustBaseResponse({
                  effectiveEnd: chain[6].epoch,
                  endEntryId: new Uint8Array(32).fill(1),
                  entries: [first.encode()],
                  fromEpoch: first.epoch,
                  network: pin.networkId.id,
                  nextEpoch: first.epoch + 1n,
                  status: 0n,
                }),
              )
            : Promise.reject(new Error('gone'));
        }),
      };
      await expect(session.refresh([source], { backoffMs: 0 })).rejects.toBeInstanceOf(TrustBaseUpdateError);
      expect(session.history.tip?.epoch).toBe(first.epoch);
      expect(await stored(store, pin)).toHaveLength(5);
    });

    it('fetches through the updater and saves', async () => {
      const store = new TestStore();
      const { session } = await open(store);
      const next = chain.slice(4, 7);
      const source = {
        getTrustBasePage: jest.fn(async () => page(next, next[0].epoch, next[2].epoch, await next[2].entryId())),
      };
      await expect(session.refresh([source])).resolves.toMatchObject({ appended: 3, flush: { status: 'saved' } });
      expect(await stored(store, pin)).toHaveLength(7);
    });
  });

  describe('history', () => {
    it('reports a different entry for a held epoch as an unauthenticated conflict with both ids', async () => {
      const history = TrustBaseHistory.create(pin.genesisEntryId);
      for (const entry of chain.slice(0, 4)) {
        await history.append(entry);
      }
      const forkAtHeld = (await buildChain(4, { forkAt: 3, tag: 0xe9 }))[3];
      const conflict: unknown = await history.append(forkAtHeld).catch((e: unknown) => e);
      expect(conflict).toBeInstanceOf(TrustBaseConflictError);
      expect((conflict as TrustBaseConflictError).authenticated).toBe(false);
      expect(HexConverter.encode((conflict as TrustBaseConflictError).details?.heldEntryId ?? new Uint8Array())).toBe(
        (await ids([chain[3]]))[0],
      );
    });

    it('exports the history as it was when asked, whatever is appended meanwhile', async () => {
      const history = TrustBaseHistory.create(pin.genesisEntryId);
      for (const entry of chain.slice(0, 3)) {
        await history.append(entry);
      }
      const exporting = history.toBundle();
      const appending = history.append(chain[3]);
      const exported = await TrustBaseBundle.decode(await exporting, LIMITS);
      await appending;
      expect(exported.entries).toHaveLength(3);
      expect(history.entries).toHaveLength(4);
    });
  });

  describe('bundles', () => {
    it('round-trips a history through the bundle form byte for byte', async () => {
      const history = await TrustBaseHistory.fromBundle(
        await TrustBaseBundle.decode(await bundleOf(chain), LIMITS),
        pin.genesisEntryId,
      );
      const bytes = await history.toBundle();
      expect(bytes).toEqual(await bundleOf(chain));
      const decoded = await TrustBaseBundle.decode(bytes, LIMITS);
      expect(await TrustBaseBundle.encode(decoded.entries)).toEqual(bytes);
    });

    it('refuses to encode what is not a chain', async () => {
      const other = await buildChain(3, { forkAt: 0, tag: 0xd7 });
      await expect(TrustBaseBundle.encode([])).rejects.toBeInstanceOf(TrustBaseBundleError);
      await expect(TrustBaseBundle.encode([chain[0], chain[2]])).rejects.toBeInstanceOf(TrustBaseBundleError);
      await expect(TrustBaseBundle.encode([chain[1]])).rejects.toBeInstanceOf(TrustBaseBundleError);
      // Consecutive epochs, but the second does not link to the first.
      await expect(TrustBaseBundle.encode([chain[0], other[1]])).rejects.toBeInstanceOf(TrustBaseBundleError);
    });
  });
});

async function buildPinDigest(bytes: Uint8Array): Promise<Uint8Array> {
  const { sha256 } = await import('@noble/hashes/sha2.js');
  return sha256(bytes);
}

function response(entries: readonly RootTrustBaseV2[], overrides: object): Promise<Uint8Array> {
  return (async (): Promise<Uint8Array> => {
    const tip = entries[entries.length - 1];
    return encodeTrustBaseResponse({
      effectiveEnd: tip.epoch,
      endEntryId: await tip.entryId(),
      entries: entries.map((entry) => entry.encode()),
      fromEpoch: entries[0].epoch,
      network: tip.networkId.id,
      nextEpoch: null,
      status: 0n,
      ...overrides,
    });
  })();
}

const partialBundle = (entries: readonly RootTrustBaseV2[]): Promise<Uint8Array> => response(entries, {});
const nullEndBundle = (entries: readonly RootTrustBaseV2[]): Promise<Uint8Array> =>
  response(entries, { endEntryId: null });
const cursorBundle = (entries: readonly RootTrustBaseV2[]): Promise<Uint8Array> =>
  response(entries, { nextEpoch: entries[entries.length - 1].epoch + 1n });
