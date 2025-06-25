import { JsonUtils } from '../../../src/utils/JsonUtils.js';

describe('JsonUtils', () => {
  it('should handle BigInt values in stringify', () => {
    const objWithBigInt = {
      array: [456n, 'string'],
      bigIntValue: 123n,
      nested: {
        innerBigInt: 789n,
      },
      normalString: 'test',
    };

    const result = JsonUtils.stringify(objWithBigInt);
    expect(result).toBe(
      '{"array":["456","string"],"bigIntValue":"123","nested":{"innerBigInt":"789"},"normalString":"test"}',
    );

    const parsed = JsonUtils.parse(result);
    expect(parsed).toEqual({
      array: ['456', 'string'],
      bigIntValue: '123',
      nested: {
        innerBigInt: '789',
      },
      normalString: 'test',
    });
  });

  it('should handle objects with toJSON method', () => {
    class TestClass {
      public constructor(private value: bigint) {}

      public toJSON(): unknown {
        return {
          type: 'TestClass',
          value: this.value.toString(),
        };
      }
    }

    const obj = new TestClass(123n);
    const result = JsonUtils.safeStringify(obj);

    expect(result).toBe('{"type":"TestClass","value":"123"}');
  });

  it('should handle arrays with BigInt values', () => {
    const arr = [123n, 'string', { nested: 456n }];
    const result = JsonUtils.stringify(arr);

    expect(result).toBe('["123","string",{"nested":"456"}]');
  });

  it('should handle null and undefined values', () => {
    const obj = {
      bigIntValue: 123n,
      nullValue: null,
      undefinedValue: undefined,
    };

    const result = JsonUtils.stringify(obj);
    expect(result).toBe('{"bigIntValue":"123","nullValue":null}');
  });
});
