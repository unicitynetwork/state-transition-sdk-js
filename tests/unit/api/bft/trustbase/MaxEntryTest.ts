import { loadMaxEntry } from './MaxEntryFixture.js';
import { RootTrustBaseV2 } from '../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseBundle } from '../../../../../src/api/bft/trustbase/TrustBaseBundle.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

const LIMITS = { maxBytes: 1 << 20, maxEntries: 64 };

describe('the maximum-size entry (256 members, 128-byte node ids, 256 predecessor signatures)', () => {
  const fixture = loadMaxEntry();

  it('is the largest valid entry and fits the per-entry bound with room to spare', () => {
    expect(fixture.entryBytes).toBe(95365);
    expect(HexConverter.decode(fixture.entry).length).toBe(fixture.entryBytes);
    expect(TrustBaseBundle.MAX_ENTRY_BYTES).toBe(128 * 1024);
    expect(fixture.entryBytes).toBeLessThan(TrustBaseBundle.MAX_ENTRY_BYTES);
    // The genesis has no predecessor signatures, so it is smaller still.
    expect(HexConverter.decode(fixture.genesis).length).toBeLessThan(fixture.entryBytes);
  });

  it.each(['genesis', 'entry'] as const)(
    '%s decodes and re-encodes to the same bytes with the shared entry id',
    async (field) => {
      const bytes = HexConverter.decode(fixture[field]);
      const entry = RootTrustBaseV2.decode(bytes);
      expect(entry.networkId.id).toBe(fixture.network);
      expect(entry.members.length).toBe(fixture.members);
      expect(
        entry.members.every((member) => new TextEncoder().encode(member.nodeId).length === fixture.nodeIdBytes),
      ).toBe(true);
      expect(HexConverter.encode(entry.encode())).toBe(fixture[field]);
      expect(HexConverter.encode(await entry.entryId())).toBe(
        field === 'genesis' ? fixture.genesisId : fixture.entryId,
      );
    },
  );

  it('the bundle decodes with the default budget, holding both entries byte for byte', async () => {
    const bundle = await TrustBaseBundle.decode(HexConverter.decode(fixture.bundle), LIMITS);
    expect(bundle.entries.length).toBe(2);
    expect(bundle.raw.map((raw) => HexConverter.encode(raw))).toEqual([fixture.genesis, fixture.entry]);
    expect(HexConverter.encode(await bundle.entries[0].entryId())).toBe(fixture.genesisId);
  });
});
