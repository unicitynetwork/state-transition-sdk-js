export class BigintConverter {
  /**
   * Convert bytes to unsigned long
   * @param {Uint8Array} data byte array
   * @param {Number} offset read offset
   * @param {Number} length read length
   * @returns {bigint} long value
   */
  public static decode(data: Uint8Array, offset?: number, length?: number): bigint {
    offset = offset ?? 0;
    length = length ?? data.length;

    if (offset < 0 || length < 0 || offset + length > data.length) {
      throw new Error('Index out of bounds');
    }

    let t = 0n;
    for (let i = 0; i < length; ++i) {
      t = (t << 8n) | BigInt(data[offset + i] & 0xff);
    }

    return t;
  }

  /**
   * Convert long to byte array
   * @param {bigint} value long value
   * @returns {Uint8Array} Array byte array
   */
  public static encode(value: bigint): Uint8Array {
    const result = [];

    for (let t = value; t > 0n; t >>= 8n) {
      result.unshift(Number(t & 0xffn));
    }

    return new Uint8Array(result);
  }
}
