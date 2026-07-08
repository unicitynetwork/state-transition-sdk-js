import { CborError } from './CborError.js';
import { CborMap } from './CborMap.js';
import { MajorType } from './MajorType.js';
import { BigintConverter } from '../../util/BigintConverter.js';

/**
 * Static helpers that encode TypeScript values to canonical CBOR bytes
 * (RFC 8949 §4.2).
 */
export class CborSerializer {
  /**
   * Encode an array of already-encoded CBOR items as a CBOR array.
   *
   * @param {...Uint8Array} input Encoded CBOR items.
   * @returns {Uint8Array} CBOR bytes.
   */
  public static encodeArray(...input: Uint8Array[]): Uint8Array {
    const data = new Uint8Array(input.reduce((result, value) => result + value.length, 0));
    let length = 0;
    for (const value of input) {
      data.set(value, length);
      length += value.length;
    }

    if (input.length < 24) {
      return new Uint8Array([MajorType.ARRAY | input.length, ...data]);
    }

    const lengthBytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(input.length);
    return new Uint8Array([
      MajorType.ARRAY | CborSerializer.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...data,
    ]);
  }

  /**
   * Encode a non-negative big integer as a minimally encoded big-endian CBOR byte string.
   *
   * @param {bigint} value Non-negative integer.
   * @returns {Uint8Array} CBOR bytes.
   */
  public static encodeBigInteger(value: bigint): Uint8Array {
    return CborSerializer.encodeByteString(BigintConverter.encode(value));
  }

  /**
   * Encode a boolean as the CBOR simple values `true` (0xf5) or `false` (0xf4).
   *
   * @param {boolean} data Boolean value.
   * @returns {Uint8Array} CBOR bytes.
   */
  public static encodeBoolean(data: boolean): Uint8Array {
    if (data) {
      return new Uint8Array([0xf5]);
    }
    return new Uint8Array([0xf4]);
  }

  /**
   * Encode raw bytes as a CBOR byte string.
   *
   * @param {Uint8Array} input Raw bytes.
   * @returns {Uint8Array} CBOR bytes.
   */
  public static encodeByteString(input: Uint8Array): Uint8Array {
    if (input.length < 24) {
      return new Uint8Array([MajorType.BYTE_STRING | input.length, ...input]);
    }

    const lengthBytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(input.length);
    return new Uint8Array([
      MajorType.BYTE_STRING | CborSerializer.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...input,
    ]);
  }

  /**
   * Encode a {@link CborMap} as a canonical CBOR map.
   *
   * @param {CborMap} input Canonical CBOR map.
   * @returns {Uint8Array} CBOR bytes.
   */
  public static encodeMap(input: CborMap): Uint8Array {
    const entries = input.entries;
    const dataLength = entries.reduce((result, entry) => result + entry.key.length + entry.value.length, 0);
    const data = new Uint8Array(dataLength);
    let length = 0;
    for (const entry of entries) {
      data.set(entry.key, length);
      length += entry.key.length;
      data.set(entry.value, length);
      length += entry.value.length;
    }

    if (entries.length < 24) {
      return new Uint8Array([MajorType.MAP | entries.length, ...data]);
    }

    const lengthBytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(entries.length);
    return new Uint8Array([
      MajorType.MAP | CborSerializer.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...data,
    ]);
  }

  /**
   * Encode the CBOR `null` simple value (0xf6).
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public static encodeNull(): Uint8Array {
    return new Uint8Array([0xf6]);
  }

  /**
   * Encode `data` with `encoder`, or return CBOR `null` if `data` is
   * `null`/`undefined`.
   *
   * @param {T|null|undefined} data Value to encode.
   * @param {(data: T) => Uint8Array} encoder Encoder for the inner value.
   * @returns {Uint8Array} CBOR bytes.
   */
  public static encodeNullable<T>(data: T | null | undefined, encoder: (data: T) => Uint8Array): Uint8Array {
    if (data == null) {
      return new Uint8Array([0xf6]);
    }

    return encoder(data);
  }

  /**
   * Wrap already-encoded CBOR bytes in a CBOR tag.
   *
   * @param {number|bigint} tag Tag number.
   * @param {Uint8Array} input Encoded CBOR bytes to tag.
   * @returns {Uint8Array} CBOR bytes.
   */
  public static encodeTag(tag: number | bigint, input: Uint8Array): Uint8Array {
    if (tag < 24) {
      return new Uint8Array([MajorType.TAG | Number(tag), ...input]);
    }
    const bytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(tag);

    return new Uint8Array([
      MajorType.TAG | CborSerializer.getAdditionalInformationBits(bytes.length),
      ...bytes,
      ...input,
    ]);
  }

  /**
   * Encode a UTF-8 string as a CBOR text string.
   *
   * @param {string} input Text value.
   * @returns {Uint8Array} CBOR bytes.
   */
  public static encodeTextString(input: string): Uint8Array {
    const bytes = new TextEncoder().encode(input);
    if (bytes.length < 24) {
      return new Uint8Array([MajorType.TEXT_STRING | bytes.length, ...bytes]);
    }

    const lengthBytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(bytes.length);
    return new Uint8Array([
      MajorType.TEXT_STRING | CborSerializer.getAdditionalInformationBits(lengthBytes.length),
      ...lengthBytes,
      ...bytes,
    ]);
  }

  /**
   * Encode a non-negative integer as a CBOR unsigned integer.
   *
   * @param {bigint|number} input Non-negative integer.
   * @returns {Uint8Array} CBOR bytes.
   * @throws {CborError} If `input` is negative.
   */
  public static encodeUnsignedInteger(input: bigint | number): Uint8Array {
    if (input < 0) {
      throw new CborError('Only unsigned numbers are allowed.');
    }

    if (input < 24) {
      return new Uint8Array([MajorType.UNSIGNED_INTEGER | Number(input)]);
    }

    const bytes = CborSerializer.getUnsignedIntegerAsPaddedBytes(input);

    return new Uint8Array([
      MajorType.UNSIGNED_INTEGER | CborSerializer.getAdditionalInformationBits(bytes.length),
      ...bytes,
    ]);
  }

  private static getAdditionalInformationBits(length: number): number {
    return 24 + Math.ceil(Math.log2(length));
  }

  private static getUnsignedIntegerAsPaddedBytes(input: bigint | number): Uint8Array {
    if (input < 0) {
      throw new CborError('Only unsigned numbers are allowed.');
    }

    let t: bigint;
    const bytes: number[] = [];

    for (t = BigInt(input); t > 0; t = t >> 8n) {
      bytes.push(Number(t & 255n));
    }

    if (bytes.length > 8) {
      throw new CborError('Number is not unsigned long.');
    }

    if (bytes.length === 0) {
      bytes.push(0);
    }

    bytes.reverse();

    const data = new Uint8Array(Math.pow(2, Math.ceil(Math.log2(bytes.length))));
    data.set(bytes, data.length - bytes.length);

    return data;
  }
}
