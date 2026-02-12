import { CborDeserializer } from '../../../../src/serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../src/serialization/HexConverter.js';

describe('CborSerializer', () => {
  it('should deserialize boolean', () => {
    expect(CborDeserializer.decodeBoolean(HexConverter.decode('F5'))).toEqual(true);
    expect(CborDeserializer.decodeBoolean(HexConverter.decode('F4'))).toEqual(false);
    expect(() => CborDeserializer.decodeBoolean(HexConverter.decode('F3'))).toThrow('Type mismatch, expected boolean.');
  });

  it('should deserialize bytes', () => {
    expect(CborDeserializer.decodeByteString(HexConverter.decode('45F5F4F3AAAA'))).toEqual(
      HexConverter.decode('F5F4F3AAAA'),
    );

    expect(
      CborDeserializer.decodeByteString(HexConverter.decode('540000000000000000000000000000000000000000')),
    ).toEqual(new Uint8Array(20));

    expect(() => CborDeserializer.decodeByteString(HexConverter.decode('F6'))).toThrow('Major type mismatch.');
    expect(() => CborDeserializer.decodeByteString(HexConverter.decode('5F'))).toThrow(
      'Indefinite length array not supported.',
    );
    expect(() => CborDeserializer.decodeByteString(HexConverter.decode('5E'))).toThrow(
      'Encoded item is not well-formed',
    );
  });

  it('should deserialize text', () => {
    expect(CborDeserializer.decodeTextString(HexConverter.decode('6774657374313233'))).toEqual('test123');
    expect(() => CborDeserializer.decodeTextString(HexConverter.decode('F6'))).toThrow('Major type mismatch.');
    expect(() => CborDeserializer.decodeTextString(HexConverter.decode('7F'))).toThrow(
      'Indefinite length array not supported.',
    );
    expect(() => CborDeserializer.decodeTextString(HexConverter.decode('7E'))).toThrow(
      'Encoded item is not well-formed',
    );
  });

  it('should deserialize number', () => {
    expect(CborDeserializer.decodeUnsignedInteger(HexConverter.decode('1901f4'))).toEqual(500n);
    expect(() => CborDeserializer.decodeUnsignedInteger(HexConverter.decode('F6'))).toThrow('Major type mismatch.');
    expect(() => CborDeserializer.decodeUnsignedInteger(HexConverter.decode('1c'))).toThrow(
      'Encoded item is not well-formed',
    );
  });

  it('should deserialize tag', () => {
    expect(CborDeserializer.decodeTag(HexConverter.decode('d901f4f6'))).toEqual({
      data: HexConverter.decode('f6'),
      tag: 500n,
    });
    expect(() => CborDeserializer.decodeTag(HexConverter.decode('F6'))).toThrow('Major type mismatch.');
    expect(() => CborDeserializer.decodeTag(HexConverter.decode('DE'))).toThrow('Encoded item is not well-formed');
  });

  it('should decode map', () => {
    const result = CborDeserializer.decodeMap(
      HexConverter.decode('a263616263f6581e000000000000000000000000000000000000000000000000000000000000f5'),
    );

    expect(result).toEqual([
      {
        _key: CborSerializer.encodeTextString('abc'),
        _value: CborSerializer.encodeNull(),
      },
      {
        _key: CborSerializer.encodeByteString(new Uint8Array(30)),
        _value: CborSerializer.encodeBoolean(true),
      },
    ]);

    // Map cannot be larget than safe int in javascript.
    expect(() => CborDeserializer.decodeMap(HexConverter.decode('BBFFFFFFFFFFFFFFFF'))).toThrow('Map too long.');
    expect(() =>
      CborDeserializer.decodeMap(
        HexConverter.decode('a263616263f663616263f6581e000000000000000000000000000000000000000000000000000000000000f5'),
      ),
    ).toThrow('Duplicate map key found.');
    expect(() => CborDeserializer.decodeMap(HexConverter.decode('F6'))).toThrow('Major type mismatch.');
    expect(() => CborDeserializer.decodeMap(HexConverter.decode('BE'))).toThrow('Encoded item is not well-formed');
  });

  it('should deserialize arrays', () => {
    expect(CborDeserializer.decodeArray(HexConverter.decode('824a000000000000000000006474657374'))).toEqual([
      CborSerializer.encodeByteString(new Uint8Array(10)),
      CborSerializer.encodeTextString('test'),
    ]);

    expect(() => CborDeserializer.decodeArray(HexConverter.decode('9BFFFFFFFFFFFFFFFF'))).toThrow('Array too long.');
    expect(() => CborDeserializer.decodeArray(HexConverter.decode('F6'))).toThrow('Major type mismatch.');
    expect(() => CborDeserializer.decodeArray(HexConverter.decode('9E'))).toThrow('Encoded item is not well-formed');
  });
});
