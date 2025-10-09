import { BigintConverter } from './BigintConverter.js';
import { HexConverter } from './HexConverter.js';
import { DataHash } from '../hash/DataHash.js';

export class BitString {
  /**
   * Represents a bit string as a bigint.
   */
  private readonly value: bigint;

  /**
   * Creates a BitString from a Uint8Array.
   * @param {Uint8Array} data - The input data to convert into a BitString.
   */
  public constructor(data: Uint8Array) {
    this.value = BigInt(`0x01${HexConverter.encode(data)}`);
  }

  /**
   * Creates a BitString from a DataHash imprint.
   * @param data DataHash
   * @return {BitString} A BitString instance
   */
  public static fromDataHash(data: DataHash): BitString {
    return new BitString(data.imprint);
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
