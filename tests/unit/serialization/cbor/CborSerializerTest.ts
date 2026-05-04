import { CborMap } from '../../../../src/serialization/cbor/CborMap.js';
import { CborMapEntry } from '../../../../src/serialization/cbor/CborMapEntry.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';

describe('CborSerializer', () => {
  it('should serialize boolean', () => {
    expect(CborSerializer.encodeBoolean(true)).toEqual(HexConverter.decode('F5'));
    expect(CborSerializer.encodeBoolean(false)).toEqual(HexConverter.decode('F4'));
  });

  it('should serialize null', () => {
    expect(CborSerializer.encodeNull()).toEqual(HexConverter.decode('F6'));
  });

  it('should serialize bytes', () => {
    expect(CborSerializer.encodeByteString(HexConverter.decode('F5F4F3AAAA'))).toEqual(
      HexConverter.decode('45F5F4F3AAAA'),
    );

    expect(CborSerializer.encodeByteString(new Uint8Array(20))).toEqual(
      HexConverter.decode('540000000000000000000000000000000000000000'),
    );
  });

  it('should serialize text', () => {
    expect(CborSerializer.encodeTextString('test123')).toEqual(HexConverter.decode('6774657374313233'));
  });

  it('should serialize number', () => {
    expect(CborSerializer.encodeUnsignedInteger(500n)).toEqual(HexConverter.decode('1901f4'));
    expect(() => CborSerializer.encodeUnsignedInteger(-500n)).toThrow('Only unsigned numbers are allowed.');
    expect(() => CborSerializer.encodeUnsignedInteger(50000000000000000000000000n)).toThrow(
      'Number is not unsigned long.',
    );
  });

  it('should serialize tag', () => {
    expect(CborSerializer.encodeTag(500n, CborSerializer.encodeNull())).toEqual(HexConverter.decode('d901f4f6'));
  });

  it('should encode map with bytewise lexicographic key ordering', () => {
    const result = CborSerializer.encodeMap(
      new CborMap([
        // longer key first to verify sorting
        new CborMapEntry(CborSerializer.encodeByteString(new Uint8Array(30)), CborSerializer.encodeBoolean(true)),
        new CborMapEntry(CborSerializer.encodeTextString('abc'), CborSerializer.encodeNull()),
      ]),
    );

    // bytewise: byte-string key encoded prefix 0x58 < text key encoded prefix 0x63
    expect(result).toEqual(
      HexConverter.decode('a2581e000000000000000000000000000000000000000000000000000000000000f563616263f6'),
    );
  });

  it('should sort same-length keys bytewise', () => {
    const result = CborSerializer.encodeMap(
      new CborMap([
        new CborMapEntry(CborSerializer.encodeUnsignedInteger(2n), CborSerializer.encodeNull()),
        new CborMapEntry(CborSerializer.encodeUnsignedInteger(1n), CborSerializer.encodeNull()),
      ]),
    );

    // a2 = map(2), 01 = key 1, f6 = null, 02 = key 2, f6 = null
    expect(result).toEqual(HexConverter.decode('a201f602f6'));
  });

  it('should reject duplicate keys in CborMap', () => {
    const k = CborSerializer.encodeUnsignedInteger(1n);
    const v = CborSerializer.encodeUnsignedInteger(0n);
    expect(
      () =>
        new CborMap([
          new CborMapEntry(k, v),
          new CborMapEntry(CborSerializer.encodeUnsignedInteger(2n), v),
          new CborMapEntry(k, v), // non-adjacent duplicate
        ]),
    ).toThrow('Duplicate map key in CborMap.');
  });

  it('should serialize arrays', () => {
    const serializedData = CborSerializer.encodeArray(
      CborSerializer.encodeByteString(new Uint8Array(10)),
      CborSerializer.encodeTextString('test'),
    );

    expect(serializedData).toEqual(HexConverter.decode('824a000000000000000000006474657374'));
  });
});
