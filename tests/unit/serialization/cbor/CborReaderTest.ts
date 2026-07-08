import { CborReader } from '../../../../src/serialization/cbor/CborReader.js';

describe('CborReader', () => {
  it('should read a complete nested item and stop at its boundary', () => {
    // [1, [2], 3] (0x83 0x01 0x81 0x02 0x03) followed by a trailing item 0x09.
    const reader = new CborReader(new Uint8Array([0x83, 0x01, 0x81, 0x02, 0x03, 0x09]));

    expect(Array.from(reader.readRawCbor())).toEqual([0x83, 0x01, 0x81, 0x02, 0x03]);
    // Cursor must be left exactly after the item, so the trailing byte reads back.
    expect(reader.readByte()).toBe(0x09);
  });

  it('should read deeply nested CBOR without overflowing the stack', () => {
    const depth = 100_000;
    const bytes = new Uint8Array(depth + 1);
    bytes.fill(0x81, 0, depth);

    const reader = new CborReader(bytes);
    expect(reader.readRawCbor().length).toBe(bytes.length);
    reader.assertExhausted();
  });
});
