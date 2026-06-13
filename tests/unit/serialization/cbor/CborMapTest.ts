import { CborMap } from '../../../../src/serialization/cbor/CborMap.js';
import { CborMapEntry } from '../../../../src/serialization/cbor/CborMapEntry.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';

/**
 * PR #114 / issue #113 rewrote CborMap's constructor: it sorts entries with
 * CborMap.compareEntries (bytewise on the common prefix, shorter key winning only when it
 * is a prefix of the longer — i.e. NOT the old length-first rule) and now throws on
 * duplicate keys. decodeMap enforces the same ordering on the wire. Pin both behaviours.
 */
describe('CborMap', () => {
  const k = (...bytes: number[]): Uint8Array => new Uint8Array(bytes);
  const entry = (key: Uint8Array, value: Uint8Array): CborMapEntry => new CborMapEntry(key, value);

  it('sorts entries bytewise on the common prefix, length as tiebreaker', () => {
    // [0x01] < [0x01,0x00] (prefix wins by length) < [0x02] (byte 0: 0x01 < 0x02 — length
    // never consulted). The old length-first rule would have put [0x02] before [0x01,0x00].
    const map = new CborMap([entry(k(0x02), k(0xbb)), entry(k(0x01, 0x00), k(0xcc)), entry(k(0x01), k(0xaa))]);
    expect(map.entries.map((e) => HexConverter.encode(e.key))).toEqual(['01', '0100', '02']);
  });

  it('throws on a duplicate map key', () => {
    expect(() => new CborMap([entry(k(0x01, 0x02), k(0xaa)), entry(k(0x01, 0x02), k(0xbb))])).toThrow(
      'Duplicate map key in CborMap.',
    );
  });

  it('detects a duplicate even when supplied out of order', () => {
    expect(() => new CborMap([entry(k(0x03), k(0xaa)), entry(k(0x01), k(0xbb)), entry(k(0x03), k(0xcc))])).toThrow(
      'Duplicate map key in CborMap.',
    );
  });

  it('accepts an empty entry list', () => {
    expect(new CborMap([]).entries).toEqual([]);
  });
});
