import { BitString } from '../../../src/util/BitString.js';

describe('Bit string tests', function () {
  it('toString to return initial bytes bits', () => {
    expect(new BitString(new Uint8Array([1, 1])).toString()).toEqual('0000000100000001');
  });

  it('toBigInt to return bigint format of bits', () => {
    expect(new BitString(new Uint8Array([1, 1])).toBigInt()).toEqual(0b10000000100000001n);
  });

  it('toBytes to return initial bytes', () => {
    const bytes = new Uint8Array([1, 1]);
    expect(new BitString(bytes).toBytes()).toEqual(bytes);
  });
});
