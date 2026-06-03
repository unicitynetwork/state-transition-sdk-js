import { CborError } from './CborError.js';
import { CborMap } from './CborMap.js';
import { CborMapEntry } from './CborMapEntry.js';
import { CborReader } from './CborReader.js';
import { MajorType } from './MajorType.js';
import { areUint8ArraysEqual } from '../../util/TypedArrayUtils.js';

/**
 * Static helpers that decode canonical CBOR bytes into TypeScript values.
 * Every method consumes the entire input and asserts there are no trailing
 * bytes.
 */
export class CborDeserializer {
  private static readonly FALSE_CBOR = new Uint8Array([0xf4]);
  private static readonly NULL_CBOR = new Uint8Array([0xf6]);
  private static readonly TRUE_CBOR = new Uint8Array([0xf5]);

  /**
   * Decode a CBOR array.
   *
   * @param {Uint8Array} data CBOR bytes.
   * @param {number|null} expectedLength If set, throws when the array has a different length.
   * @returns {Uint8Array[]} CBOR bytes of each element.
   * @throws {CborError} On wrong length or trailing bytes.
   */
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

  /**
   * Decode a CBOR boolean.
   *
   * @param {Uint8Array} data CBOR bytes.
   * @returns {boolean} Boolean value.
   * @throws {CborError} If the input encodes anything other than `true` or `false`.
   */
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

  /**
   * Decode a CBOR byte string.
   *
   * @param {Uint8Array} data CBOR bytes.
   * @returns {Uint8Array} Decoded payload bytes.
   */
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

  /**
   * Decode a CBOR map, enforcing canonical key ordering and rejecting
   * duplicate keys.
   *
   * @param {Uint8Array} data CBOR bytes.
   * @returns {CborMapEntry[]} Decoded entries.
   * @throws {CborError} On duplicate or out-of-order keys.
   */
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

  /**
   * Decode a CBOR negative integer.
   *
   * @returns {bigint} Decoded integer.
   * @throws {CborError} Always; not yet implemented.
   */
  public static decodeNegativeInteger(): bigint {
    throw new CborError('Not implemented.');
  }

  /**
   * Decode `data` with `decode`, or return `null` if the input is CBOR `null`.
   *
   * @param {Uint8Array} data CBOR bytes.
   * @param {(data: Uint8Array) => T} decode Decoder for the inner value.
   * @returns {T|null} Decoded value or `null`.
   */
  public static decodeNullable<T>(data: Uint8Array, decode: (data: Uint8Array) => T): T | null {
    const reader = new CborReader(data);
    const cbor = reader.readRawCbor();
    reader.assertExhausted();

    if (areUint8ArraysEqual(cbor, CborDeserializer.NULL_CBOR)) {
      return null;
    }

    return decode(cbor);
  }

  /**
   * Decode a CBOR tag.
   *
   * @param {Uint8Array} data CBOR bytes.
   * @returns {{data: Uint8Array, tag: bigint}} Tag number and CBOR bytes of the tagged value.
   */
  public static decodeTag(data: Uint8Array): { data: Uint8Array; tag: bigint } {
    const reader = new CborReader(data);
    const tag = reader.readLength(MajorType.TAG);
    const cbor = reader.readRawCbor();
    reader.assertExhausted();

    return { data: cbor, tag };
  }

  /**
   * Decode a CBOR text string.
   *
   * @param {Uint8Array} data CBOR bytes.
   * @returns {string} UTF-8 decoded string.
   */
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

  /**
   * Decode a CBOR unsigned integer.
   *
   * @param {Uint8Array} data CBOR bytes.
   * @returns {bigint} Decoded integer.
   */
  public static decodeUnsignedInteger(data: Uint8Array): bigint {
    const reader = new CborReader(data);
    const result = reader.readLength(MajorType.UNSIGNED_INTEGER);
    reader.assertExhausted();

    return result;
  }
}
