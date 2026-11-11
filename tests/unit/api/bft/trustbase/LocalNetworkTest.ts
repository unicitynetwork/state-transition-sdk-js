import { buildBundle, buildChain, buildPin, parseBundleFields } from './TrustBaseTestUtils.js';
import { releasePinFromBundle } from '../../../../../src/api/bft/trustbase/ReleasePin.js';
import { ReleasePinInvalidError } from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseSession } from '../../../../../src/api/bft/trustbase/TrustBaseSession.js';
import { MemoryTrustBaseStore, trustBaseCacheKey } from '../../../../../src/api/bft/trustbase/TrustBaseStore.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

describe('a local network opened from its own bundle', () => {
  it('derives the whole pin from the bundle bytes alone', async () => {
    const chain = await buildChain(3);
    const reference = await buildPin(chain, 3);

    const pin = await releasePinFromBundle(reference.embeddedBundle);

    expect(pin.networkId.equals(reference.networkId)).toBe(true);
    expect(pin.genesisEpoch).toBe(reference.genesisEpoch);
    expect(pin.pinnedEpoch).toBe(reference.pinnedEpoch);
    expect(HexConverter.encode(pin.genesisEntryId)).toBe(HexConverter.encode(reference.genesisEntryId));
    expect(HexConverter.encode(pin.pinnedEntryId)).toBe(HexConverter.encode(reference.pinnedEntryId));
    expect(HexConverter.encode(pin.bundleSha256)).toBe(HexConverter.encode(reference.bundleSha256));
  });

  it('opens under the namespace local, never public, with the strictly verified history', async () => {
    const chain = await buildChain(3);
    const { embeddedBundle, genesisEntryId, networkId } = await buildPin(chain, 2);
    const store = new MemoryTrustBaseStore();

    const { session } = await TrustBaseSession.openLocal(embeddedBundle, store);
    expect(session.tip?.epoch).toBe(chain[1].epoch);
    await session.append(chain[2]);
    await session.flush();

    expect(await store.read(trustBaseCacheKey(networkId, genesisEntryId, 'local'), 1 << 20)).not.toBeNull();
    expect(await store.read(trustBaseCacheKey(networkId, genesisEntryId, 'public'), 1 << 20)).toBeNull();
  });

  it('refuses a bundle that is not a complete history', async () => {
    const chain = await buildChain(3);
    const { embeddedBundle } = await buildPin(chain, 3);
    const fields = parseBundleFields(embeddedBundle);

    // a continuation cursor
    await expect(
      releasePinFromBundle(buildBundle({ ...fields, nextEpoch: fields.effectiveEnd + 1n })),
    ).rejects.toBeInstanceOf(ReleasePinInvalidError);
    // a refused request (a non-OK status), not a bundle
    await expect(releasePinFromBundle(buildBundle({ ...fields, status: 3n }))).rejects.toBeInstanceOf(
      ReleasePinInvalidError,
    );
    // not starting at the genesis: the first entry is not a genesis entry
    await expect(
      releasePinFromBundle(
        buildBundle({ ...fields, entries: fields.entries.slice(1), fromEpoch: fields.fromEpoch + 1n }),
      ),
    ).rejects.toBeInstanceOf(ReleasePinInvalidError);
    // garbage
    await expect(releasePinFromBundle(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(ReleasePinInvalidError);
  });
});
