import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

export class HexConverter {
  /**
   * Convert byte array to hex
   * @param {Uint8Array} data byte array
   * @returns string hex string
   */
  public static encode(data: Uint8Array): string {
    return bytesToHex(data);
  }

  /**
   * Convert hex string to bytes
   * @param value hex string
   * @returns {Uint8Array} byte array
   */
  public static decode(value: string): Uint8Array {
    // TODO: Do we need prefix?
    if (value.startsWith('0x') || value.startsWith('0X')) {
      value = value.slice(2);
    }
    return hexToBytes(value);
  }
}
