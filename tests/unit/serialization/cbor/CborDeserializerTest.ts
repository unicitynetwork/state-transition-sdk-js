import { CborDeserializer } from '../../../../src/serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';

describe('CborDeserializer', () => {
  it('should deserialize boolean', () => {
    expect(CborDeserializer.decodeBoolean(HexConverter.decode('F5'))).toEqual(true);
    expect(CborDeserializer.decodeBoolean(HexConverter.decode('F4'))).toEqual(false);
    expect(() => CborDeserializer.decodeBoolean(HexConverter.decode('F3'))).toThrow('Type mismatch, expected boolean.');
    expect(() => CborDeserializer.decodeBoolean(HexConverter.decode('F5F4'))).toThrow('Expected end of data');
  });

  it('should deserialize bytes', () => {
    expect(CborDeserializer.decodeByteString(HexConverter.decode('45F5F4F3AAAA'))).toEqual(
      HexConverter.decode('F5F4F3AAAA'),
    );

    expect(
      CborDeserializer.decodeByteString(HexConverter.decode('540000000000000000000000000000000000000000')),
    ).toEqual(new Uint8Array(20));

    expect(() => CborDeserializer.decodeByteString(HexConverter.decode('F6'))).toThrow('Major type mismatch');
    expect(() => CborDeserializer.decodeByteString(HexConverter.decode('5F'))).toThrow(
      'Indefinite-length encoding not allowed',
    );
    expect(() => CborDeserializer.decodeByteString(HexConverter.decode('5E'))).toThrow(
      'Reserved additional information 30',
    );
    expect(() => CborDeserializer.decodeByteString(HexConverter.decode('40F6'))).toThrow('Expected end of data');
  });

  it('should deserialize text', () => {
    expect(CborDeserializer.decodeTextString(HexConverter.decode('6774657374313233'))).toEqual('test123');
    expect(() => CborDeserializer.decodeTextString(HexConverter.decode('F6'))).toThrow('Major type mismatch');
    expect(() => CborDeserializer.decodeTextString(HexConverter.decode('7F'))).toThrow(
      'Indefinite-length encoding not allowed',
    );
    expect(() => CborDeserializer.decodeTextString(HexConverter.decode('7E'))).toThrow(
      'Reserved additional information 30',
    );
    expect(() => CborDeserializer.decodeTextString(HexConverter.decode('60F6'))).toThrow('Expected end of data');
  });

  it('should deserialize number', () => {
    expect(CborDeserializer.decodeUnsignedInteger(HexConverter.decode('1901f4'))).toEqual(500n);
    expect(() => CborDeserializer.decodeUnsignedInteger(HexConverter.decode('F6'))).toThrow('Major type mismatch');
    expect(() => CborDeserializer.decodeUnsignedInteger(HexConverter.decode('1c'))).toThrow(
      'Reserved additional information 28',
    );
    expect(() => CborDeserializer.decodeUnsignedInteger(HexConverter.decode('00F6'))).toThrow('Expected end of data');
  });

  it('should reject non-canonical 1-byte argument', () => {
    expect(() => CborDeserializer.decodeUnsignedInteger(HexConverter.decode('1817'))).toThrow(
      'Byte length 1 is not canonical for value 23.',
    );
  });

  it('should reject non-canonical 2-byte argument', () => {
    expect(() => CborDeserializer.decodeUnsignedInteger(HexConverter.decode('1900FF'))).toThrow(
      'Byte length 2 is not canonical for value 255.',
    );
  });

  it('should reject non-canonical 4-byte argument', () => {
    expect(() => CborDeserializer.decodeUnsignedInteger(HexConverter.decode('1A0000FFFF'))).toThrow(
      'Byte length 4 is not canonical for value 65535.',
    );
  });

  it('should reject non-canonical 8-byte argument', () => {
    expect(() => CborDeserializer.decodeUnsignedInteger(HexConverter.decode('1B00000000FFFFFFFF'))).toThrow(
      'Byte length 8 is not canonical for value 4294967295.',
    );
  });

  it('should accept boundary canonical encodings', () => {
    expect(CborDeserializer.decodeUnsignedInteger(HexConverter.decode('1818'))).toEqual(24n);
    expect(CborDeserializer.decodeUnsignedInteger(HexConverter.decode('190100'))).toEqual(256n);
    expect(CborDeserializer.decodeUnsignedInteger(HexConverter.decode('1A00010000'))).toEqual(65536n);
    expect(CborDeserializer.decodeUnsignedInteger(HexConverter.decode('1B0000000100000000'))).toEqual(4294967296n);
  });

  it('should deserialize tag', () => {
    expect(CborDeserializer.decodeTag(HexConverter.decode('d901f4f6'))).toEqual({
      data: HexConverter.decode('f6'),
      tag: 500n,
    });
    expect(() => CborDeserializer.decodeTag(HexConverter.decode('F6'))).toThrow('Major type mismatch');
    expect(() => CborDeserializer.decodeTag(HexConverter.decode('DE'))).toThrow('Reserved additional information 30');
    expect(() => CborDeserializer.decodeTag(HexConverter.decode('C0F6F6'))).toThrow('Expected end of data');
  });

  it('should decode map', () => {
    const result = CborDeserializer.decodeMap(
      HexConverter.decode('a2581e000000000000000000000000000000000000000000000000000000000000f563616263f6'),
    );

    expect(result).toEqual([
      {
        _key: CborSerializer.encodeByteString(new Uint8Array(30)),
        _value: CborSerializer.encodeBoolean(true),
      },
      {
        _key: CborSerializer.encodeTextString('abc'),
        _value: CborSerializer.encodeNull(),
      },
    ]);

    // Map cannot be larger than safe int in javascript.
    expect(() => CborDeserializer.decodeMap(HexConverter.decode('BBFFFFFFFFFFFFFFFF'))).toThrow('Map too long.');
    expect(() =>
      CborDeserializer.decodeMap(
        HexConverter.decode('a3581e000000000000000000000000000000000000000000000000000000000000f563616263f663616263f6'),
      ),
    ).toThrow('Duplicate map key found.');
    expect(() => CborDeserializer.decodeMap(HexConverter.decode('F6'))).toThrow('Major type mismatch');
    expect(() => CborDeserializer.decodeMap(HexConverter.decode('BE'))).toThrow('Reserved additional information 30');
    expect(() => CborDeserializer.decodeMap(HexConverter.decode('A0F6'))).toThrow('Expected end of data');
    expect(() =>
      CborDeserializer.decodeMap(
        HexConverter.decode('a263616263f6581e000000000000000000000000000000000000000000000000000000000000f5'),
      ),
    ).toThrow('Map keys are not in canonical order.');
  });

  it('should decode nullable', () => {
    expect(CborDeserializer.decodeNullable(HexConverter.decode('F6'), CborDeserializer.decodeTextString)).toEqual(null);
    expect(
      CborDeserializer.decodeNullable(HexConverter.decode('6774657374313233'), CborDeserializer.decodeTextString),
    ).toEqual('test123');
    expect(() =>
      CborDeserializer.decodeNullable(HexConverter.decode('F660'), CborDeserializer.decodeTextString),
    ).toThrow('Expected end of data');
  });

  it('should deserialize arrays', () => {
    expect(CborDeserializer.decodeArray(HexConverter.decode('824a000000000000000000006474657374'))).toEqual([
      CborSerializer.encodeByteString(new Uint8Array(10)),
      CborSerializer.encodeTextString('test'),
    ]);

    expect(() => CborDeserializer.decodeArray(HexConverter.decode('9BFFFFFFFFFFFFFFFF'))).toThrow('Array too long.');
    expect(() => CborDeserializer.decodeArray(HexConverter.decode('F6'))).toThrow('Major type mismatch');
    expect(() => CborDeserializer.decodeArray(HexConverter.decode('9E'))).toThrow('Reserved additional information 30');
    expect(() => CborDeserializer.decodeArray(HexConverter.decode('80F6'))).toThrow('Expected end of data');
  });
});
