import { loadMaxEntry } from './MaxEntryFixture.js';
import { buildBundle, parseBundleFields } from './TrustBaseTestUtils.js';
import { TrustBaseEncodingError } from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseHistory } from '../../../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { TRUST_BASE_PAGE_LIMITS, TrustBaseRange } from '../../../../../src/api/bft/trustbase/TrustBaseRange.js';
import { TrustBaseUpdater } from '../../../../../src/api/bft/trustbase/TrustBaseUpdater.js';
import { NetworkId } from '../../../../../src/api/NetworkId.js';
import { CborSerializer } from '../../../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

describe('the maximum-size entry as a GetTrustBase page', () => {
  const fixture = loadMaxEntry();
  const network = NetworkId.fromId(fixture.network);
  const page = (): Uint8Array => HexConverter.decode(fixture.bundle);

  it('decodes within the page budget (1 MiB, 64 entries), both entries byte for byte', async () => {
    expect(page().length).toBeLessThan(TRUST_BASE_PAGE_LIMITS.maxBytes);
    const range = await TrustBaseRange.decode(page(), TRUST_BASE_PAGE_LIMITS, network);
    expect(range.entries.length).toBe(2);
    expect(HexConverter.encode(range.entries[1].encode())).toBe(fixture.entry);
  });

  it('is refused when it exceeds the byte budget of the page, whatever its entries', async () => {
    await expect(
      TrustBaseRange.decode(page(), { ...TRUST_BASE_PAGE_LIMITS, maxBytes: page().length - 1 }, network),
    ).rejects.toBeInstanceOf(TrustBaseEncodingError);
  });

  it('refuses an entry of 128 KiB + 1 before decoding it', async () => {
    const f = parseBundleFields(page());
    const over = CborSerializer.encodeByteString(new Uint8Array(131068));
    expect(over.length).toBe(131073);
    await expect(
      TrustBaseRange.decode(buildBundle({ ...f, entries: [over] }), TRUST_BASE_PAGE_LIMITS, network),
    ).rejects.toThrow(/Entry 0 of 131073 bytes/);
  });

  it('catches an empty history up from the pinned genesis through the updater', async () => {
    const history = TrustBaseHistory.create(HexConverter.decode(fixture.genesisId));
    const source = { getTrustBasePage: (): Promise<Uint8Array> => Promise.resolve(page()) };
    await expect(TrustBaseUpdater.update(history, [source], { backoffMs: 0, network })).resolves.toBe(2);
    expect(history.tip?.epoch).toBe(2n);
  });
});
