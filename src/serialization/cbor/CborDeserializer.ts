import { CborError } from './CborError.js';
import { CborMap } from './CborMap.js';
import { CborMapEntry } from './CborMapEntry.js';
import { CborReader } from './CborReader.js';
import { MajorType } from './MajorType.js';
import { areUint8ArraysEqual } from '../../util/TypedArrayUtils.js';

export class CborDeserializer {
  private static readonly FALSE_CBOR = new Uint8Array([0xf4]);
  private static readonly NULL_CBOR = new Uint8Array([0xf6]);
  private static readonly TRUE_CBOR = new Uint8Array([0xf5]);

  public static decodeArray(data: Uint8Array, expectedLength: number | null = null): Uint8Array[] {
    const reader = new CborReader(data);
    const length = reader.readLength(MajorType.ARRAY);
    if (length > 0xffffffff) {
      throw new CborError('Array too long.');
    }

    const result: Uint8Array[] = [];
    for (let i = 0; i < length; i++) {
      result.push(reader.readRawCbor());
    }

    if (expectedLength !== null && expectedLength !== result.length) {
      throw new CborError(`Expected array length ${expectedLength}, got ${result.length}.`);
    }

    reader.assertExhausted();

    return result;
  }

  public static decodeBoolean(data: Uint8Array): boolean {
    const reader = new CborReader(data);
    const cbor = reader.readRawCbor();
    reader.assertExhausted();

    if (areUint8ArraysEqual(cbor, CborDeserializer.TRUE_CBOR)) {
      return true;
    }

    if (areUint8ArraysEqual(cbor, CborDeserializer.FALSE_CBOR)) {
      return false;
    }

    throw new CborError('Type mismatch, expected boolean.');
  }

  public static decodeByteString(data: Uint8Array): Uint8Array {
    const reader = new CborReader(data);
    const length = reader.readLength(MajorType.BYTE_STRING);
    if (length > 0xffffffff) {
      throw new CborError('Byte string too long.');
    }

    const result = reader.read(Number(length));
    reader.assertExhausted();
    return result;
  }

  public static decodeMap(data: Uint8Array): CborMapEntry[] {
    const reader = new CborReader(data);
    const length = reader.readLength(MajorType.MAP);
    if (length > 0xffffffff) {
      throw new CborError('Map too long.');
    }

    const result: CborMapEntry[] = [];
    for (let i = 0; i < length; i++) {
      const entry = new CborMapEntry(reader.readRawCbor(), reader.readRawCbor());

      if (result.length > 0) {
        const comparison = CborMap.compareEntries(result[result.length - 1], entry);
        if (comparison === 0) {
          throw new CborError('Duplicate map key found.');
        }
        if (comparison > 0) {
          throw new CborError('Map keys are not in canonical order.');
        }
      }
      result.push(entry);
    }

    reader.assertExhausted();
    return result;
  }

  public static decodeNegativeInteger(): bigint {
    throw new CborError('Not implemented.');
  }

  public static decodeNullable<T>(data: Uint8Array, decode: (data: Uint8Array) => T): T | null {
    const reader = new CborReader(data);
    const cbor = reader.readRawCbor();
    reader.assertExhausted();

    if (areUint8ArraysEqual(cbor, CborDeserializer.NULL_CBOR)) {
      return null;
    }

    return decode(cbor);
  }

  public static decodeTag(data: Uint8Array): { data: Uint8Array; tag: bigint } {
    const reader = new CborReader(data);
    const tag = reader.readLength(MajorType.TAG);
    const cbor = reader.readRawCbor();
    reader.assertExhausted();

    return { data: cbor, tag };
  }

  public static decodeTextString(data: Uint8Array): string {
    const reader = new CborReader(data);
    const length = reader.readLength(MajorType.TEXT_STRING);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new CborError('Text string too long.');
    }
    const result = reader.read(Number(length));
    reader.assertExhausted();

    return new TextDecoder().decode(result);
  }

  public static decodeUnsignedInteger(data: Uint8Array): bigint {
    const reader = new CborReader(data);
    const result = reader.readLength(MajorType.UNSIGNED_INTEGER);
    reader.assertExhausted();

    return result;
  }
}
