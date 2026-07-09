import {
  bitsToString,
  commonPrefixLength,
  getBitAtDepth,
  regionFromKey,
} from '../../../src/smt/SparseMerkleTreePathUtils.js';
import { BitString } from '../../../src/util/BitString.js';

describe('Sparse Merkle Tree tests', function () {
  it('calculate common path length', () => {
    const a = new Uint8Array(32);
    const b = new Uint8Array(32);

    // Identical keys share their whole big-endian prefix, up to the cap.
    expect(commonPrefixLength(a, b, 256)).toBe(256);
    expect(commonPrefixLength(a, b, 10)).toBe(10);

    b[0] = 0x80; // differ at depth 0 (most significant bit of byte 0).
    expect(commonPrefixLength(a, b, 256)).toBe(0);

    b[0] = 0x01; // differ at depth 7 (least significant bit of byte 0).
    expect(commonPrefixLength(a, b, 256)).toBe(7);

    b[0] = 0x00;
    b[2] = 0x01; // differ at depth 23 (least significant bit of byte 2).
    expect(commonPrefixLength(a, b, 256)).toBe(23);
    expect(commonPrefixLength(a, b, 10)).toBe(10); // capped below the divergence.
  });

  it('getBitAtDepth follows the big-endian spec convention', () => {
    const key = new Uint8Array(32);
    key[0] = 0b1000_0001; // MSB (depth 0) and LSB (depth 7) of the first byte set.
    key[31] = 0x01; // depth 255 set.

    expect(getBitAtDepth(key, 0)).toBe(1);
    expect(getBitAtDepth(key, 1)).toBe(0);
    expect(getBitAtDepth(key, 7)).toBe(1);
    expect(getBitAtDepth(key, 254)).toBe(0);
    expect(getBitAtDepth(key, 255)).toBe(1);

    // The routing bigint bit at depth d must match the spec bit at depth d.
    const path = BitString.fromBytesBigEndian(key).toBigInt();
    for (const depth of [0, 1, 7, 254, 255]) {
      expect(Number((path >> BigInt(depth)) & 1n)).toBe(getBitAtDepth(key, depth));
    }
  });

  // Region bytes keep the depth-bit prefix in the high-order bits and zero every suffix bit.
  it('regionFromKey packs the key prefix into high-order bits', () => {
    const key = new Uint8Array(32);

    // Depth 3 keeps the top 3 bits of byte 0 (depths 0 and 2 set here) and zeroes the rest.
    key[0] = 0b1010_1111;
    const region = regionFromKey(key, 3);
    const expected = new Uint8Array(32);
    expected[0] = 0b1010_0000;
    expect(region).toStrictEqual(expected);

    // Depth 9 keeps byte 0 whole and only the top bit of byte 1; the depth-9 bit is dropped.
    key[0] = 0b1000_0001; // depths 0 and 7.
    key[1] = 0b1100_0000; // depth 8 kept, depth 9 dropped.
    const spill = regionFromKey(key, 9);
    const spillExpected = new Uint8Array(32);
    spillExpected[0] = 0b1000_0001;
    spillExpected[1] = 0b1000_0000;
    expect(spill).toStrictEqual(spillExpected);
  });

  it('getBitAtDepth rejects out-of-bounds depths', () => {
    const key = new Uint8Array(32); // 256 valid depths: 0..255.
    expect(() => getBitAtDepth(key, -1)).toThrow();
    expect(() => getBitAtDepth(key, 256)).toThrow();
    expect(() => getBitAtDepth(key, 0)).not.toThrow();
    expect(() => getBitAtDepth(key, 255)).not.toThrow();
  });

  it('bitsToString renders whole bytes plus the partial byte', () => {
    const data = new Uint8Array([0b1010_0000, 0b1100_0000]);
    expect(bitsToString(data, 0)).toBe('');
    expect(bitsToString(data, 3)).toBe('101');
    expect(bitsToString(data, 8)).toBe('10100000');
    expect(bitsToString(data, 10)).toBe('1010000011');
  });

  it('bitsToString rejects out-of-bounds lengths', () => {
    const data = new Uint8Array(2); // 16 valid bit-lengths: 0..16 (16 shows every bit).
    expect(() => bitsToString(data, -1)).toThrow();
    expect(() => bitsToString(data, 17)).toThrow();
    expect(() => bitsToString(data, 16)).not.toThrow();
  });
});
