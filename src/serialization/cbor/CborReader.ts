import { CborError } from './CborError.js';
import { MajorType } from './MajorType.js';

/**
 * Low-level cursor over a CBOR byte buffer. Tracks a read position and
 * provides primitives used by {@link CborDeserializer} to parse canonical
 * CBOR. Indefinite-length encodings are rejected.
 */
export class CborReader {
  private static ADDITIONAL_INFORMATION_MASK = 0b00011111;
  private static MAJOR_TYPE_MASK = 0b11100000;

  private position: number = 0;

  public constructor(private readonly data: Uint8Array) {}

  /**
   * Throw if the reader has not consumed every byte of the buffer.
   *
   * @throws {CborError} If unread bytes remain.
   */
  public assertExhausted(): void {
    if (this.position !== this.data.length) {
      throw new CborError(
        `Expected end of data: ${this.data.length - this.position} byte(s) remaining at position ${this.position}.`,
      );
    }
  }

  /**
   * Read exactly `length` bytes and advance the cursor.
   *
   * @param {number} length Number of bytes to read.
   * @returns {Uint8Array} Bytes read.
   * @throws {CborError} If fewer than `length` bytes remain.
   */
  public read(length: number): Uint8Array {
    try {
      if (this.position + length > this.data.length) {
        throw new CborError('Premature end of data.');
      }

      return this.data.slice(this.position, this.position + length);
    } finally {
      this.position += length;
    }
  }

  /**
   * Read a single byte and advance the cursor.
   *
   * @returns {number} Byte read.
   * @throws {CborError} If no bytes remain.
   */
  public readByte(): number {
    if (this.position >= this.data.length) {
      throw new CborError('Premature end of data.');
    }

    return this.data[this.position++];
  }

  /**
   * Read the initial byte and any extended length bytes for the given major
   * type, returning the encoded length/value. Enforces canonical
   * minimum-byte encoding.
   *
   * @param {MajorType} majorType Expected major type.
   * @returns {bigint} Decoded length/value.
   * @throws {CborError} On major-type mismatch, indefinite-length encoding,
   *   reserved additional info, or non-canonical length.
   */
  public readLength(majorType: MajorType): bigint {
    const initialByte = this.readByte();
    const parsedMajorType: MajorType = initialByte & CborReader.MAJOR_TYPE_MASK;

    if (parsedMajorType !== majorType) {
      throw new CborError(`Major type mismatch: expected ${majorType}, got ${parsedMajorType}.`);
    }

    const additionalInformation = initialByte & CborReader.ADDITIONAL_INFORMATION_MASK;
    if (additionalInformation < 24) {
      return BigInt(additionalInformation);
    }

    switch (majorType) {
      case MajorType.MAP:
      case MajorType.ARRAY:
      case MajorType.BYTE_STRING:
      case MajorType.TEXT_STRING:
        if (additionalInformation == 31) {
          throw new CborError(`Indefinite-length encoding not allowed in canonical CBOR (major type ${majorType}).`);
        }
        break;
    }

    if (additionalInformation > 27) {
      throw new CborError(`Reserved additional information ${additionalInformation} for major type ${majorType}.`);
    }

    let t = 0n;
    const length = Math.pow(2, additionalInformation - 24);
    for (let i = 0; i < length; ++i) {
      t = (t << 8n) | BigInt(this.readByte());
    }

    const threshold = length === 1 ? 24n : 1n << BigInt(length * 4);
    if (t < threshold) {
      throw new CborError(`Byte length ${length} is not canonical for value ${t}.`);
    }

    return t;
  }

  /**
   * Read a single complete CBOR data item (including nested arrays, maps,
   * and tags) without decoding it.
   *
   * @returns {Uint8Array} CBOR bytes of the data item.
   */
  public readRawCbor(): Uint8Array {
    if (this.position >= this.data.length) {
      throw new CborError('Premature end of data.');
    }

    const majorType: MajorType = this.data[this.position] & CborReader.MAJOR_TYPE_MASK;
    const position = this.position;
    const length = this.readLength(majorType);
    switch (majorType) {
      case MajorType.BYTE_STRING:
      case MajorType.TEXT_STRING:
        this.read(Number(length));
        break;
      case MajorType.ARRAY:
        for (let i = 0; i < length; i++) {
          this.readRawCbor();
        }
        break;
      case MajorType.MAP:
        for (let i = 0; i < length; i++) {
          this.readRawCbor();
          this.readRawCbor();
        }
        break;
      case MajorType.TAG:
        this.readRawCbor();
        break;
      default:
        break;
    }

    return this.data.slice(position, this.position);
  }
}
