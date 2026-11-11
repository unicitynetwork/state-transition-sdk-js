import { loadMaxEntry } from './MaxEntryFixture.js';
import { buildBundle, parseBundleFields } from './TrustBaseTestUtils.js';
import { releasePinFromBundle, TRUST_BASE_BUNDLE_LIMITS } from '../../../../../src/api/bft/trustbase/ReleasePin.js';
import { RootTrustBaseV2 } from '../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseBundle } from '../../../../../src/api/bft/trustbase/TrustBaseBundle.js';
import { TrustBaseSession } from '../../../../../src/api/bft/trustbase/TrustBaseSession.js';
import { MemoryTrustBaseStore, trustBaseCacheKey } from '../../../../../src/api/bft/trustbase/TrustBaseStore.js';
import { NetworkId } from '../../../../../src/api/NetworkId.js';
import { CborSerializer } from '../../../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

describe('the maximum-size entry through the cache and the session', () => {
  const fixture = loadMaxEntry();
  const entry = (hex: string): RootTrustBaseV2 => RootTrustBaseV2.decode(HexConverter.decode(hex));
  const genesisBundle = (): Promise<Uint8Array> => TrustBaseBundle.encode([entry(fixture.genesis)]);
  const stored = async (store: MemoryTrustBaseStore): Promise<Uint8Array | null> => {
    const pin = await releasePinFromBundle(await genesisBundle());
    const key = trustBaseCacheKey(pin.networkId, pin.genesisEntryId, 'local');
    return (await store.read(key, TRUST_BASE_BUNDLE_LIMITS.maxBytes))?.bytes ?? null;
  };

  it('the default load budget admits it: the entry is under the 128 KiB bound', () => {
    expect(TRUST_BASE_BUNDLE_LIMITS.maxEntryBytes).toBe(128 * 1024);
    expect(fixture.entryBytes).toBeLessThan(TRUST_BASE_BUNDLE_LIMITS.maxEntryBytes ?? 0);
  });

  it('exports the two-entry history as exactly the shared bundle bytes', async () => {
    const encoded = await TrustBaseBundle.encode([entry(fixture.genesis), entry(fixture.entry)]);
    expect(HexConverter.encode(encoded)).toBe(fixture.bundle);
  });

  it('opens locally from the full bundle', async () => {
    const { diagnostics, session } = await TrustBaseSession.openLocal(
      HexConverter.decode(fixture.bundle),
      new MemoryTrustBaseStore(),
    );
    expect(diagnostics).toEqual([]);
    expect(session.history.networkId?.equals(NetworkId.fromId(fixture.network))).toBe(true);
    expect(session.tip?.epoch).toBe(2n);
  });

  it('appends it to a session at the genesis, saves it, and the next open loads it from the cache after verifying it again', async () => {
    const store = new MemoryTrustBaseStore();
    const first = await TrustBaseSession.openLocal(await genesisBundle(), store);
    await first.session.append(entry(fixture.entry));
    await expect(first.session.flush()).resolves.toMatchObject({ status: 'saved' });
    expect(HexConverter.encode((await stored(store)) ?? new Uint8Array())).toBe(fixture.bundle);

    const second = await TrustBaseSession.openLocal(await genesisBundle(), store);
    expect(second.diagnostics).toEqual([]);
    expect(second.session.tip?.epoch).toBe(2n);
  });

  it('a cache whose entry exceeds the configured per-entry budget is rejected as oversize and the embedded history serves', async () => {
    const store = new MemoryTrustBaseStore();
    await TrustBaseSession.openLocal(await genesisBundle(), store).then(async ({ session }) => {
      await session.append(entry(fixture.entry));
      await session.flush();
    });
    const limits = { ...TRUST_BASE_BUNDLE_LIMITS, maxEntryBytes: fixture.entryBytes - 1 };
    const { diagnostics, session } = await TrustBaseSession.openLocal(await genesisBundle(), store, { limits });
    expect(diagnostics.map((d) => (d.code === 'CacheRejected' ? d.reason : d.code))).toEqual(['oversize']);
    expect(session.tip?.epoch).toBe(1n);
    // At the entry's own size it is accepted.
    const exact = { ...TRUST_BASE_BUNDLE_LIMITS, maxEntryBytes: fixture.entryBytes };
    const again = await TrustBaseSession.openLocal(await genesisBundle(), store, { limits: exact });
    expect(again.session.tip?.epoch).toBe(2n);
  });

  it('a cache holding an entry of 128 KiB + 1 is rejected as oversize under the default budget', async () => {
    const store = new MemoryTrustBaseStore();
    const pin = await releasePinFromBundle(await genesisBundle());
    const key = trustBaseCacheKey(pin.networkId, pin.genesisEntryId, 'local');
    const f = parseBundleFields(HexConverter.decode(fixture.bundle));
    const over = CborSerializer.encodeByteString(new Uint8Array(131068));
    await store.compareAndSwap(key, null, buildBundle({ ...f, entries: [f.entries[0], over] }));
    const { diagnostics, session } = await TrustBaseSession.openLocal(await genesisBundle(), store);
    expect(diagnostics.map((d) => (d.code === 'CacheRejected' ? d.reason : d.code))).toEqual(['oversize']);
    expect(session.tip?.epoch).toBe(1n);
  });
});
