import { CborError } from '../../serialization/cbor/CborError.js';

/**
 * Shard identifier.
 */
export class ShardId {
  private constructor(
    private readonly _bits: Uint8Array,
    public readonly length: number,
  ) {}

  /**
   * @returns {Uint8Array} Copy of the bit-string bytes.
   */
  public get bits(): Uint8Array {
    return new Uint8Array(this._bits);
  }

  /**
   * Decode a ShardId from its byte encoding.
   *
   * @param {Uint8Array} data Encoded bytes.
   * @returns {ShardId} Decoded shard id.
   * @throws {CborError} If the encoding is invalid.
   */
  public static decode(data: Uint8Array): ShardId {
    let lastByte = data.at(-1);
    if (lastByte === undefined) {
      throw new CborError('Invalid ShardId encoding: empty input');
    }

    for (let i = 8; i > 0; i--) {
      if ((lastByte & 1) === 1) {
        if (i === 1) {
          return new ShardId(data.subarray(0, data.length - 1), (data.length - 1) * 8);
        }

        return new ShardId(
          new Uint8Array([...data.subarray(0, data.length - 1), (lastByte >> 1) << (8 - i + 1)]),
          (data.length - 1) * 8 + i - 1,
        );
      }

      lastByte >>= 1;
    }

    throw new CborError('Invalid ShardId encoding: last byte doesnt contain end marker');
  }

  /**
   * @returns {Uint8Array} Encoded shard id bytes.
   */
  public encode(): Uint8Array {
    const byteCount = Math.floor(this.length / 8);
    const bitCount = this.length % 8;
    const result = new Uint8Array(byteCount + 1);
    result.set(this._bits.subarray(0, byteCount));
    if (bitCount === 0) {
      result[byteCount] = 0b10000000;
    } else {
      const v = this._bits[byteCount] & ~(0xff >> bitCount);
      result[byteCount] = v | (1 << (7 - bitCount));
    }
    return result;
  }

  /**
   * Return the bit at the given index.
   *
   * @param {number} index Bit index, zero-based.
   * @returns {number} The bit value (0 or 1).
   * @throws {Error} If the index is out of bounds.
   */
  public getBit(index: number): number {
    if (index < 0 || index >= this.length) {
      throw new Error('ShardId bit index out of bounds');
    }
    return (this._bits[Math.floor(index / 8)] >> (7 - (index % 8))) & 1;
  }

  /**
   * Check whether this shard id is a bit-prefix of the given data.
   *
   * @param {Uint8Array} data Bytes to test.
   * @returns {boolean} True if this shard id is a prefix of `data`.
   */
  public isPrefixOf(data: Uint8Array): boolean {
    const fullBytes = Math.floor(this.length / 8);
    const remainingBits = this.length % 8;

    for (let i = 0; i < fullBytes; i++) {
      if (this._bits[i] !== data[i]) {
        return false;
      }
    }

    if (remainingBits > 0) {
      const mask = 0xff & (0xff << (8 - remainingBits));
      if ((this._bits[fullBytes] & mask) !== (data[fullBytes] & mask)) {
        return false;
      }
    }

    return true;
  }

  /**
   * @returns {string} Binary string representation of the shard id.
   */
  public toString(): string {
    const fullBytes = Math.floor(this.length / 8);
    const remainingBits = this.length % 8;
    let result = '';
    for (let i = 0; i < fullBytes; i++) {
      result += this._bits[i].toString(2).padStart(8, '0');
    }
    if (remainingBits > 0) {
      result += this._bits[fullBytes].toString(2).padStart(8, '0').slice(0, remainingBits);
    }
    return result;
  }
}
