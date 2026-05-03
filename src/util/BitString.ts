import { BigintConverter } from './BigintConverter.js';
import { HexConverter } from './HexConverter.js';

export class BitString {
  /**
   * Represents a bit string as a bigint.
   */
  private readonly value: bigint;

  private constructor(data: Uint8Array) {
    this.value = BigInt(`0x01${HexConverter.encode(data)}`);
  }

  /**
   * Creates a BitString from raw bytes with no bit reordering.
   * Bigint bit 0 is the LSB of the last byte.
   */
  public static fromBytes(data: Uint8Array): BitString {
    return new BitString(new Uint8Array(data));
  }

  /**
   * Creates a BitString for LSB-first tree routing with reversed byte order.
   * Bigint bit 0 = bit 0 (LSB) of data[0], matching getBitAtDepth LSB convention.
   */
  public static fromBytesReversedLSB(data: Uint8Array): BitString {
    return new BitString(new Uint8Array(data).reverse());
  }

  /**
   * Creates a BitString for MSB-first tree routing with reversed byte order.
   * Bigint bit 0 = bit 7 (MSB) of data[0], matching getBitAtDepth MSB convention.
   */
  public static fromBytesReversedMSB(data: Uint8Array): BitString {
    return new BitString(
      new Uint8Array(data)
        .map(
          (b) =>
            ((b & 0x80) >> 7) |
            ((b & 0x40) >> 5) |
            ((b & 0x20) >> 3) |
            ((b & 0x10) >> 1) |
            ((b & 0x08) << 1) |
            ((b & 0x04) << 3) |
            ((b & 0x02) << 5) |
            ((b & 0x01) << 7),
        )
        .reverse(),
    );
  }

  /**
   * Converts BitString to bigint by adding a leading byte 1 to input byte array.
   * This is to ensure that the bigint will retain the leading zero bits.
   * @returns {bigint} The bigint representation of the bit string
   */
  public toBigInt(): bigint {
    return this.value;
  }

  /**
   * Converts bit string to Uint8Array.
   * @returns {Uint8Array} The Uint8Array representation of the bit string
   */
  public toBytes(): Uint8Array {
    return BigintConverter.encode(this.value).slice(1);
  }

  /**
   * Converts bit string to string.
   * @returns {string} The string representation of the bit string
   */
  public toString(): string {
    return this.value.toString(2).slice(1);
  }
}
