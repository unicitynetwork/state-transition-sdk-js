import { BigintConverter } from './BigintConverter.js';
import { HexConverter } from './HexConverter.js';

/**
 * Bit string backed by a {@link bigint} with a leading sentinel bit, so that
 * leading zero bits are preserved across conversions. Provides byte-order and
 * bit-order helpers used by sparse Merkle tree routing.
 */
export class BitString {
  /**
   * Represents a bit string as a bigint.
   */
  private readonly value: bigint;

  private constructor(data: Uint8Array) {
    this.value = BigInt(`0x01${HexConverter.encode(data)}`);
  }

  /**
   * Create a BitString from raw bytes with no bit reordering.
   * Bigint bit 0 is the LSB of the last byte.
   *
   * @param {Uint8Array} data Input bytes.
   * @returns {BitString} New bit string.
   */
  public static fromBytes(data: Uint8Array): BitString {
    return new BitString(new Uint8Array(data));
  }

  /**
   * Create a BitString for spec-compliant big-endian tree routing, where bigint
   * bit `i` is the big-endian bit at depth `i` (depth 0 = `data[0] & 0x80`).
   *
   * @param {Uint8Array} data Input bytes.
   * @returns {BitString} New bit string.
   */
  public static fromBytesBigEndian(data: Uint8Array): BitString {
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
   * Convert BitString to bigint by adding a leading byte 1 to input byte array.
   * This is to ensure that the bigint will retain the leading zero bits.
   *
   * @returns {bigint} Bigint representation of the bit string.
   */
  public toBigInt(): bigint {
    return this.value;
  }

  /**
   * Convert bit string to Uint8Array.
   *
   * @returns {Uint8Array} Byte representation of the bit string.
   */
  public toBytes(): Uint8Array {
    return BigintConverter.encode(this.value).slice(1);
  }

  /**
   * Convert bit string to string.
   *
   * @returns {string} Binary string representation of the bit string.
   */
  public toString(): string {
    return this.value.toString(2).slice(1);
  }
}
