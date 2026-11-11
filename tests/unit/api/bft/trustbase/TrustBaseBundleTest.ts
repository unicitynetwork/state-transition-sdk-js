import {
  buildBundle,
  buildEntry,
  IBundleFields,
  loadVectors,
  parseBundleFields,
  parseEntryFields,
  vectorEntry,
} from './TrustBaseTestUtils.js';
import { RootTrustBaseV2 } from '../../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseBundle } from '../../../../../src/api/bft/trustbase/TrustBaseBundle.js';
import {
  TrustBaseBundleError,
  TrustBaseEncodingError,
  TrustBaseInvalidError,
} from '../../../../../src/api/bft/trustbase/TrustBaseError.js';
import { CborSerializer } from '../../../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../../src/util/HexConverter.js';

const LIMITS = { maxBytes: 1 << 20, maxEntries: 64 };

const threeEntryBundle = (): IBundleFields => {
  const vector = loadVectors().bundles.find((candidate) => candidate.name.startsWith('three'));
  if (!vector) {
    throw new Error('No three-entry bundle vector');
  }
  return parseBundleFields(HexConverter.decode(vector.hex));
};

const rejects = async (
  fields: IBundleFields,
  error: new (...args: never[]) => Error,
  message?: RegExp,
  limits = LIMITS,
): Promise<void> => {
  const promise = TrustBaseBundle.decode(buildBundle(fields), limits);
  await expect(promise).rejects.toBeInstanceOf(error);
  if (message) {
    await expect(promise).rejects.toThrow(message);
  }
};

describe('TrustBaseBundle: shared vectors', () => {
  it.each(loadVectors().bundles)('bundle $name: entries, ids, tip and re-encoding', async (vector) => {
    const bundle = await TrustBaseBundle.decode(HexConverter.decode(vector.hex), LIMITS);
    const ids = await Promise.all(bundle.entries.map((entry) => entry.entryId()));
    expect(ids.map((id) => HexConverter.encode(id))).toEqual(vector.entryIds);
    expect(bundle.entries[0].isGenesis()).toBe(true);
    expect(bundle.tip.epoch).toBe(BigInt(vector.entryIds.length));
    expect(bundle.networkId.id).toBe(5);
    expect(bundle.raw.map((bytes) => HexConverter.encode(bytes))).toEqual(
      bundle.entries.map((entry) => HexConverter.encode(entry.encode())),
    );
    expect(HexConverter.encode(buildBundle(parseBundleFields(HexConverter.decode(vector.hex))))).toEqual(vector.hex);
  });

  it('the one-entry bundle holds the genesis entry only', async () => {
    const vector = loadVectors().bundles.find((candidate) => candidate.name.startsWith('one-entry'));
    const bundle = await TrustBaseBundle.decode(HexConverter.decode(vector?.hex ?? ''), LIMITS);
    expect(bundle.entries).toHaveLength(1);
    expect(bundle.tip.isGenesis()).toBe(true);
  });
});

describe('TrustBaseBundle: rules, one at a time', () => {
  it('control: the rebuilt three-entry bundle is accepted, so every failure below is its own rule', async () => {
    await expect(TrustBaseBundle.decode(buildBundle(threeEntryBundle()), LIMITS)).resolves.toBeDefined();
  });

  it('rejects a status other than OK (a refused request is not a bundle)', async () => {
    await rejects({ ...threeEntryBundle(), status: 3n }, TrustBaseBundleError);
  });

  it('rejects a status that is not defined', async () => {
    await rejects({ ...threeEntryBundle(), status: 8n }, TrustBaseEncodingError, /Status 8 is not defined/);
  });

  it('rejects a continuation cursor', async () => {
    await rejects({ ...threeEntryBundle(), nextEpoch: 4n }, TrustBaseBundleError);
  });

  it('rejects an OK response without entries', async () => {
    await rejects({ ...threeEntryBundle(), entries: [] }, TrustBaseBundleError);
  });

  it('rejects a missing end entry id, and one of the wrong length', async () => {
    await rejects({ ...threeEntryBundle(), endEntryId: null }, TrustBaseBundleError, /No end entry id/);
    await rejects({ ...threeEntryBundle(), endEntryId: new Uint8Array(31) }, TrustBaseEncodingError);
  });

  it('rejects a partial range that does not start at a genesis entry', async () => {
    const f = threeEntryBundle();
    await rejects({ ...f, entries: f.entries.slice(1), fromEpoch: 2n }, TrustBaseBundleError);
  });

  it('rejects a gap between epochs', async () => {
    const f = threeEntryBundle();
    await rejects({ ...f, entries: [f.entries[0], f.entries[2]] }, TrustBaseBundleError);
  });

  it('rejects a gap even when the link is intact (epoch 3 linked straight to the genesis)', async () => {
    const f = threeEntryBundle();
    const genesisId = await RootTrustBaseV2.decode(f.entries[0]).entryId();
    const third = buildEntry({ ...parseEntryFields(f.entries[2]), previousEntryId: genesisId });
    await rejects(
      { ...f, endEntryId: await RootTrustBaseV2.decode(third).entryId(), entries: [f.entries[0], third] },
      TrustBaseBundleError,
      /does not follow 1/,
    );
  });

  it('rejects an embedded entry above the per-entry bound before decoding it', async () => {
    const f = threeEntryBundle();
    await rejects(
      { ...f, entries: [CborSerializer.encodeByteString(new Uint8Array(131072))] },
      TrustBaseEncodingError,
      /Entry 0 of 131077 bytes/,
    );
  });

  it('the per-entry bound is 128 KiB: an entry of exactly that size passes the size check, one byte more does not', async () => {
    expect(TrustBaseBundle.MAX_ENTRY_BYTES).toBe(131072);
    const f = threeEntryBundle();
    // The byte string header of a payload above 64 KiB is five bytes, so 131067 bytes of payload make an entry of exactly the bound.
    const atBound = CborSerializer.encodeByteString(new Uint8Array(131067));
    expect(atBound.length).toBe(131072);
    // It is refused later, as not an entry, never for its size.
    const error = await TrustBaseBundle.decode(buildBundle({ ...f, entries: [atBound] }), LIMITS).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toMatch(/Entry 0 of \d+ bytes/);
    await rejects(
      { ...f, entries: [CborSerializer.encodeByteString(new Uint8Array(131068))] },
      TrustBaseEncodingError,
      /Entry 0 of 131073 bytes/,
    );
  });

  it('rejects a gap even when the link is intact (epoch 3 linked straight to the genesis)', async () => {
    const f = threeEntryBundle();
    const genesisId = await RootTrustBaseV2.decode(f.entries[0]).entryId();
    const third = buildEntry({ ...parseEntryFields(f.entries[2]), previousEntryId: genesisId });
    await rejects(
      { ...f, endEntryId: await RootTrustBaseV2.decode(third).entryId(), entries: [f.entries[0], third] },
      TrustBaseBundleError,
      /does not follow 1/,
    );
  });

  it('rejects an embedded entry above the per-entry bound before decoding it', async () => {
    const f = threeEntryBundle();
    await rejects(
      { ...f, entries: [CborSerializer.encodeByteString(new Uint8Array(131072))] },
      TrustBaseEncodingError,
      /Entry 0 of 131077 bytes/,
    );
  });

  it('the per-entry bound is 128 KiB: an entry of exactly that size passes the size check, one byte more does not', async () => {
    expect(TrustBaseBundle.MAX_ENTRY_BYTES).toBe(131072);
    const f = threeEntryBundle();
    // The byte string header of a payload above 64 KiB is five bytes, so 131067 bytes of payload make an entry of exactly the bound.
    const atBound = CborSerializer.encodeByteString(new Uint8Array(131067));
    expect(atBound.length).toBe(131072);
    // It is refused later, as not an entry, never for its size.
    const error = await TrustBaseBundle.decode(buildBundle({ ...f, entries: [atBound] }), LIMITS).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toMatch(/Entry 0 of \d+ bytes/);
    await rejects(
      { ...f, entries: [CborSerializer.encodeByteString(new Uint8Array(131068))] },
      TrustBaseEncodingError,
      /Entry 0 of 131073 bytes/,
    );
  });

  it('rejects an entry that does not link to its predecessor, with the epochs consecutive', async () => {
    const f = threeEntryBundle();
    const second = parseEntryFields(f.entries[1]);
    const broken = buildEntry({ ...second, previousEntryId: new Uint8Array(32).fill(0x11) });
    await rejects({ ...f, entries: [f.entries[0], broken, f.entries[2]] }, TrustBaseBundleError);
  });

  it('rejects a header that starts at another epoch than its first entry', async () => {
    await rejects({ ...threeEntryBundle(), fromEpoch: 2n }, TrustBaseBundleError);
  });

  it('rejects an effective end other than the last entry epoch', async () => {
    await rejects({ ...threeEntryBundle(), effectiveEnd: 2n }, TrustBaseBundleError);
  });

  it('rejects an end entry id that is not the last entry id', async () => {
    await rejects({ ...threeEntryBundle(), endEntryId: new Uint8Array(32).fill(0x22) }, TrustBaseBundleError);
  });

  it('rejects an entry of another network than the header', async () => {
    await rejects({ ...threeEntryBundle(), network: 6n }, TrustBaseBundleError);
  });

  it('rejects a version other than 1 and a network of zero', async () => {
    await rejects({ ...threeEntryBundle(), version: 2n }, TrustBaseEncodingError, /Version 2, expected 1/);
    // A header network of 0 matches no entry (an entry with network 0 is invalid), so it is refused as a mismatch, not as a bad encoding.
    await rejects(
      { ...threeEntryBundle(), network: 0n },
      TrustBaseBundleError,
      /Entry 0 of network 5 in a bundle for 0/,
    );
    await rejects(
      { ...threeEntryBundle(), network: 65536n },
      TrustBaseEncodingError,
      /Network identifier 65536 above 65535/,
    );
  });

  it('rejects an embedded entry that fails its own rules, by that entry class', async () => {
    const f = threeEntryBundle();
    const bad = buildEntry({ ...parseEntryFields(vectorEntry('genesis')), epoch: 0n });
    await rejects(
      { ...f, effectiveEnd: 0n, endEntryId: new Uint8Array(32), entries: [bad], fromEpoch: 0n },
      TrustBaseInvalidError,
    );
    await rejects({ ...f, entries: [new Uint8Array([0x01])] }, TrustBaseEncodingError);
  });

  it('rejects trailing bytes, truncation and a wrong tag', async () => {
    const bytes = buildBundle(threeEntryBundle());
    await expect(TrustBaseBundle.decode(new Uint8Array([...bytes, 0]), LIMITS)).rejects.toBeInstanceOf(
      TrustBaseEncodingError,
    );
    await expect(TrustBaseBundle.decode(bytes.slice(0, bytes.length - 1), LIMITS)).rejects.toBeInstanceOf(
      TrustBaseEncodingError,
    );
    const wrongTag = HexConverter.decode(HexConverter.encode(bytes).replace('d99867', 'd99868'));
    await expect(TrustBaseBundle.decode(wrongTag, LIMITS)).rejects.toThrow(/Tag 39016, expected 39015/);
    const seven = HexConverter.decode(HexConverter.encode(bytes).replace('d9986788', 'd9986787').slice(0, -2));
    await expect(TrustBaseBundle.decode(seven, LIMITS)).rejects.toThrow(/Expected 8 fields, got 7/);
  });

  it('rejects a header integer that is not in its shortest form', async () => {
    const hex = HexConverter.encode(buildBundle(threeEntryBundle()));
    // d99867 88 01 05 00 ...: the version 01 written as 1801
    const padded = hex.replace('d9986788' + '01', 'd9986788' + '1801');
    await expect(TrustBaseBundle.decode(HexConverter.decode(padded), LIMITS)).rejects.toBeInstanceOf(
      TrustBaseEncodingError,
    );
  });

  it('enforces the budget: bytes first, then entries', async () => {
    const bytes = buildBundle(threeEntryBundle());
    await expect(TrustBaseBundle.decode(bytes, { maxBytes: bytes.length - 1, maxEntries: 64 })).rejects.toBeInstanceOf(
      TrustBaseEncodingError,
    );
    await expect(TrustBaseBundle.decode(bytes, { maxBytes: bytes.length, maxEntries: 2 })).rejects.toBeInstanceOf(
      TrustBaseEncodingError,
    );
    await expect(TrustBaseBundle.decode(bytes, { maxBytes: bytes.length, maxEntries: 3 })).resolves.toBeDefined();
    await expect(TrustBaseBundle.decode(bytes, { maxBytes: 0, maxEntries: 3 })).rejects.toBeInstanceOf(
      TrustBaseEncodingError,
    );
  });
});
