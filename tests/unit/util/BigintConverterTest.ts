import { BigintConverter } from '../../../src/util/BigintConverter.js';

describe('BigintConverter', () => {
  it('encodes minimally without a length', () => {
    expect(BigintConverter.encode(0n)).toStrictEqual(new Uint8Array([]));
    expect(BigintConverter.encode(1n)).toStrictEqual(new Uint8Array([1]));
    expect(BigintConverter.encode(0x0102n)).toStrictEqual(new Uint8Array([0x01, 0x02]));
  });

  it('left-pads to the requested length', () => {
    expect(BigintConverter.encode(0n, 4)).toStrictEqual(new Uint8Array([0, 0, 0, 0]));
    expect(BigintConverter.encode(1n, 4)).toStrictEqual(new Uint8Array([0, 0, 0, 1]));
    expect(BigintConverter.encode(0x0102n, 4)).toStrictEqual(new Uint8Array([0, 0, 0x01, 0x02]));
  });

  it('encodes a value that exactly fills the length', () => {
    expect(BigintConverter.encode(0xffffn, 2)).toStrictEqual(new Uint8Array([0xff, 0xff]));
  });

  it('throws when the value does not fit in the requested length', () => {
    expect(() => BigintConverter.encode(0x0102n, 1)).toThrow(RangeError);
    expect(() => BigintConverter.encode(1n << 256n, 32)).toThrow('Value does not fit in 32 bytes.');
  });

  it('round-trips a padded value through decode', () => {
    expect(BigintConverter.decode(BigintConverter.encode(0x123456n, 32))).toEqual(0x123456n);
  });
});
