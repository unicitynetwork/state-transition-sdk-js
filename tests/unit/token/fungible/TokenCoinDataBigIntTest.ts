import { TokenCoinData } from '../../../../src/token/fungible/TokenCoinData.js';

describe('TokenCoinData BigInt JSON Serialization', () => {
  it('should handle normal JSON serialization correctly', () => {
    const coinData = new TokenCoinData([
      [123n, 456n],
      [789n, 101112n],
    ]);
    const json = coinData.toJSON();
    const restored = TokenCoinData.fromJSON(json);

    expect(restored.getByKey(123n)).toBe(456n);
    expect(restored.getByKey(789n)).toBe(101112n);
  });

  it('should provide clear error message for object types from JSON.stringify BigInt corruption', () => {
    // Simulate what happens when JSON.stringify converts BigInt to {}
    const corruptedData = [{}, {}];

    expect(() => {
      TokenCoinData.fromJSON([corruptedData]);
    }).toThrow(
      'Cannot convert object to BigInt. This indicates a JSON serialization issue with BigInt values. Received: {}',
    );
  });

  it('should handle string values correctly', () => {
    const stringData = [
      ['123', '456'],
      ['789', '101112'],
    ];
    const restored = TokenCoinData.fromJSON(stringData);

    expect(restored.getByKey(123n)).toBe(456n);
    expect(restored.getByKey(789n)).toBe(101112n);
  });

  it('should handle number values correctly', () => {
    const numberData = [
      [123, 456],
      [789, 101112],
    ];
    const restored = TokenCoinData.fromJSON(numberData);

    expect(restored.getByKey(123n)).toBe(456n);
    expect(restored.getByKey(789n)).toBe(101112n);
  });

  it('should handle BigInt values correctly', () => {
    const bigintData = [
      [123n, 456n],
      [789n, 101112n],
    ];
    const restored = TokenCoinData.fromJSON(bigintData);

    expect(restored.getByKey(123n)).toBe(456n);
    expect(restored.getByKey(789n)).toBe(101112n);
  });

  it('should provide helpful error for undefined values', () => {
    const undefinedData = [[undefined, '456']];

    expect(() => {
      TokenCoinData.fromJSON(undefinedData);
    }).toThrow('Unsupported type for BigInt conversion: undefined. Expected string, number, or bigint.');
  });

  it('should provide helpful error for null values', () => {
    const nullData = [[null, '456']];

    expect(() => {
      TokenCoinData.fromJSON(nullData);
    }).toThrow('Cannot convert null to BigInt. This indicates a JSON serialization issue with BigInt values.');
  });

  it('should handle mixed valid types', () => {
    const mixedData = [
      ['123', 456],
      [789n, '101112'],
    ];
    const restored = TokenCoinData.fromJSON(mixedData);

    expect(restored.getByKey(123n)).toBe(456n);
    expect(restored.getByKey(789n)).toBe(101112n);
  });
});
