import {
  buildBundle,
  buildEntry,
  IBundleFields,
  loadVectors,
  parseEntryFields,
  rangeFields,
} from './TrustBaseTestUtils.js';
import { RootTrustBaseV2 } from '../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import {
  TrustBaseBundleError,
  TrustBaseEncodingError,
  TrustBaseInvalidError,
} from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { TrustBaseRange, TrustBaseStatus } from '../../../../../src/api/bft/trustbase/TrustBaseRange.js';
import { NetworkId } from '../../../../../src/api/NetworkId.js';
import { CborSerializer } from '../../../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

const LIMITS = { maxBytes: 1 << 20, maxEntries: 64 };
const NETWORK = NetworkId.fromId(5);

const rejects = async (
  fields: IBundleFields,
  error: new (...args: never[]) => Error,
  message?: RegExp,
): Promise<void> => {
  const promise = TrustBaseRange.decode(buildBundle(fields), LIMITS, NETWORK);
  await expect(promise).rejects.toBeInstanceOf(error);
  if (message) {
    await expect(promise).rejects.toThrow(message);
  }
};

describe('TrustBaseRange: a page of the GetTrustBase protocol', () => {
  it('control: a range from epoch 2 to the end decodes, entries ascending from the requested epoch', async () => {
    const range = await TrustBaseRange.decode(buildBundle(rangeFields()), LIMITS, NETWORK);
    expect(range.status).toBe(TrustBaseStatus.OK);
    expect(range.entries.map((entry) => entry.epoch)).toEqual([2n, 3n]);
    expect(range.fromEpoch).toBe(2n);
    expect(range.effectiveEnd).toBe(3n);
    expect(range.nextEpoch).toBeNull();
  });

  it('a first page of a paged response carries a cursor to the next epoch', async () => {
    const f = rangeFields();
    const range = await TrustBaseRange.decode(
      buildBundle({ ...f, entries: [f.entries[0]], nextEpoch: 3n }),
      LIMITS,
      NETWORK,
    );
    expect(range.entries.map((entry) => entry.epoch)).toEqual([2n]);
    expect(range.nextEpoch).toBe(3n);
    expect(range.effectiveEnd).toBe(3n);
  });

  it('a page that begins at the genesis is a range like any other', async () => {
    const vector = loadVectors().bundles.find((candidate) => candidate.name.startsWith('three'));
    const range = await TrustBaseRange.decode(HexConverter.decode(vector?.hex ?? ''), LIMITS, NETWORK);
    expect(range.entries[0].isGenesis()).toBe(true);
  });

  it.each([
    [TrustBaseStatus.INVALID_REQUEST],
    [TrustBaseStatus.WRONG_NETWORK],
    [TrustBaseStatus.NOT_YET_AVAILABLE],
    [TrustBaseStatus.HISTORY_MISMATCH],
    [TrustBaseStatus.LIMIT_TOO_SMALL],
    [TrustBaseStatus.BUSY],
    [TrustBaseStatus.UNAVAILABLE],
  ])('status %i without entries and without a cursor is a refusal that decodes', async (status) => {
    const f = rangeFields();
    const range = await TrustBaseRange.decode(
      buildBundle({ ...f, effectiveEnd: 1n, endEntryId: null, entries: [], status: BigInt(status) }),
      LIMITS,
      NETWORK,
    );
    expect(range.status).toBe(status);
    expect(range.entries).toHaveLength(0);
  });

  it('rejects a refusal that carries entries, and one that carries a cursor', async () => {
    const f = rangeFields();
    await rejects({ ...f, status: 3n }, TrustBaseBundleError, /carries entries or a cursor/);
    await rejects({ ...f, endEntryId: null, entries: [], nextEpoch: 3n, status: 3n }, TrustBaseBundleError);
  });

  it('rejects a status that is not defined', async () => {
    await rejects({ ...rangeFields(), status: 8n }, TrustBaseEncodingError, /Status 8 is not defined/);
  });

  it('rejects a response for another network than the one asked for', async () => {
    await expect(TrustBaseRange.decode(buildBundle(rangeFields()), LIMITS, NetworkId.fromId(6))).rejects.toThrow(
      /for network 5, asked for 6/,
    );
  });

  it('rejects an OK page without entries and one without an end entry id', async () => {
    const f = rangeFields();
    await rejects({ ...f, entries: [] }, TrustBaseBundleError, /without entries/);
    await rejects({ ...f, endEntryId: null }, TrustBaseBundleError, /No end entry id/);
  });

  it('rejects a first entry that is not the epoch the page starts at', async () => {
    await rejects({ ...rangeFields(), fromEpoch: 3n }, TrustBaseBundleError, /the page starts at 3/);
  });

  it('rejects an entry of another network than the response', async () => {
    // header and request agree on 6, the embedded entries are of network 5
    const promise = TrustBaseRange.decode(buildBundle({ ...rangeFields(), network: 6n }), LIMITS, NetworkId.fromId(6));
    await expect(promise).rejects.toBeInstanceOf(TrustBaseBundleError);
    await expect(promise).rejects.toThrow(/network 5 in a page for 6/);
  });

  it('rejects a gap between epochs, and a link to anything but the predecessor', async () => {
    const f = rangeFields();
    const third = RootTrustBaseV2.decode(f.entries[1]);
    const fourth = buildEntry({
      ...parseEntryFields(f.entries[1]),
      epoch: third.epoch + 1n,
      epochStart: third.epochStartRound + 1n,
      previousEntryId: await third.entryId(),
    });
    await rejects(
      { ...f, effectiveEnd: 4n, entries: [f.entries[0], fourth] },
      TrustBaseBundleError,
      /does not follow 2/,
    );
    const broken = buildEntry({ ...parseEntryFields(f.entries[1]), previousEntryId: new Uint8Array(32).fill(0x11) });
    await rejects({ ...f, entries: [f.entries[0], broken] }, TrustBaseBundleError, /does not link/);
  });

  it('rejects a page that ends before the effective end without a cursor', async () => {
    const f = rangeFields();
    await rejects({ ...f, effectiveEnd: 4n }, TrustBaseBundleError, /without a cursor before the effective end/);
  });

  it('rejects a cursor that is not the epoch after the last entry, or lies beyond the end', async () => {
    const f = rangeFields();
    await rejects({ ...f, entries: [f.entries[0]], nextEpoch: 4n }, TrustBaseBundleError, /Cursor 4/);
    await rejects({ ...f, effectiveEnd: 2n, entries: [f.entries[0]], nextEpoch: 3n }, TrustBaseBundleError, /Cursor 3/);
    // inside the end, but not the epoch after the last entry
    await rejects({ ...f, entries: [f.entries[0]], nextEpoch: 2n }, TrustBaseBundleError, /Cursor 2 after epoch 2/);
  });

  it('rejects an end entry id that is not the last entry id when the page reaches the end', async () => {
    await rejects(
      { ...rangeFields(), endEntryId: new Uint8Array(32).fill(0x22) },
      TrustBaseBundleError,
      /end entry id differs/,
    );
  });

  it('does not check the end entry id of a page that has a cursor (it names the end of the snapshot)', async () => {
    const f = rangeFields();
    await expect(
      TrustBaseRange.decode(
        buildBundle({
          ...f,
          endEntryId: RootTrustBaseV2.decode(f.entries[1]).previousEntryId,
          entries: [f.entries[0]],
          nextEpoch: 3n,
        }),
        LIMITS,
        NETWORK,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects an embedded entry that fails its own rules, by that entry class', async () => {
    const f = rangeFields();
    const bad = buildEntry({ ...parseEntryFields(f.entries[0]), epoch: 0n });
    await rejects({ ...f, entries: [bad], fromEpoch: 0n }, TrustBaseInvalidError);
  });

  it('rejects an embedded entry above the per-entry bound before decoding it', async () => {
    await rejects(
      { ...rangeFields(), entries: [CborSerializer.encodeByteString(new Uint8Array(131072))] },
      TrustBaseEncodingError,
      /Entry 0 of 131077 bytes/,
    );
  });

  it('enforces the budget: bytes first, then entries', async () => {
    const bytes = buildBundle(rangeFields());
    await expect(
      TrustBaseRange.decode(bytes, { maxBytes: bytes.length - 1, maxEntries: 64 }, NETWORK),
    ).rejects.toBeInstanceOf(TrustBaseEncodingError);
    await expect(
      TrustBaseRange.decode(bytes, { maxBytes: bytes.length, maxEntries: 1 }, NETWORK),
    ).rejects.toBeInstanceOf(TrustBaseEncodingError);
    await expect(
      TrustBaseRange.decode(bytes, { maxBytes: bytes.length, maxEntries: 2 }, NETWORK),
    ).resolves.toBeDefined();
  });

  it('rejects trailing bytes and a wrong tag', async () => {
    const bytes = buildBundle(rangeFields());
    await expect(TrustBaseRange.decode(new Uint8Array([...bytes, 0]), LIMITS, NETWORK)).rejects.toBeInstanceOf(
      TrustBaseEncodingError,
    );
    const wrongTag = HexConverter.decode(HexConverter.encode(bytes).replace('d99867', 'd99868'));
    await expect(TrustBaseRange.decode(wrongTag, LIMITS, NETWORK)).rejects.toThrow(/Tag 39016/);
  });
});
