import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/**
 * Conversion between hex strings and byte arrays. Accepts an optional
 * `0x`/`0X` prefix on decode and produces lowercase, unprefixed hex on encode.
 */
export class HexConverter {
  /**
   * Convert hex string to bytes.
   *
   * @param {string} value Hex string, optionally prefixed with `0x` or `0X`.
   * @returns {Uint8Array} Decoded byte array.
   */
  public static decode(value: string): Uint8Array {
    if (value.startsWith('0x') || value.startsWith('0X')) {
      value = value.slice(2);
    }
    return hexToBytes(value);
  }

  /**
   * Convert byte array to hex.
   *
   * @param {Uint8Array} data Byte array.
   * @returns {string} Lowercase, unprefixed hex string.
   */
  public static encode(data: Uint8Array): string {
    return bytesToHex(data);
  }
}
