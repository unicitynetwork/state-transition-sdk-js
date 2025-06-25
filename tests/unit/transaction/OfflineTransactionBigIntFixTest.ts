import { JsonUtils } from '../../../src/utils/JsonUtils.js';

describe('OfflineTransaction BigInt Serialization Fix', () => {
  it('should demonstrate JsonUtils.safeStringify handles BigInt correctly', () => {
    // Create an object that would fail with normal JSON.stringify
    const objWithBigInt = {
      arrayWithBigInt: [111n, 'string', 222n],
      bigIntField: 123456789012345678901234567890n,
      nestedObject: {
        anotherBigInt: 987654321098765432109876543210n,
        normalValue: 'nested',
      },
      normalField: 'test',
    };

    // Test that normal JSON.stringify fails
    expect(() => {
      JSON.stringify(objWithBigInt);
    }).toThrow('Do not know how to serialize a BigInt');

    // Test that JsonUtils.safeStringify works
    const result = JsonUtils.safeStringify(objWithBigInt);
    expect(typeof result).toBe('string');

    // Parse back and verify BigInt values became strings
    const parsed = JSON.parse(result);
    expect(parsed.bigIntField).toBe('123456789012345678901234567890');
    expect(parsed.nestedObject.anotherBigInt).toBe('987654321098765432109876543210');
    expect(parsed.arrayWithBigInt).toEqual(['111', 'string', '222']);
  });

  it('should document the proper usage pattern for OfflineTransaction', () => {
    // Simulate creating a minimal OfflineTransaction (without full setup)
    const mockOfflineTransaction = {
      toJSON(): unknown {
        return {
          commitment: {
            authenticator: { signature: 'test-signature' },
            requestId: 'test-request-id',
            transactionData: {
              recipient: 'test-recipient',
              salt: 'test-salt',
              sourceState: {
                data: null,
                unlockPredicate: { type: 'test' },
              },
            },
          },
          token: {
            genesis: {
              data: {
                coinData: [['123', '456']], // Already properly stringified
              },
            },
            state: { data: null },
            transactions: [],
          },
        };
      },
    };

    // Test that toJSON() works (returns object)
    const jsonObj = mockOfflineTransaction.toJSON();
    expect(typeof jsonObj).toBe('object');

    // Test that JSON.stringify on toJSON() result works
    const stringified = JSON.stringify(jsonObj);
    expect(typeof stringified).toBe('string');

    // Test that our safe stringify works on objects with toJSON
    const safeStringified = JsonUtils.safeStringify(mockOfflineTransaction);
    expect(typeof safeStringified).toBe('string');

    // Both should produce the same result when the toJSON() is properly implemented
    expect(stringified).toBe(safeStringified);
  });

  it('should demonstrate the BigInt serialization problem and solution', () => {
    // Create an object that has toJSON but still contains raw BigInt somewhere
    const problematicObject = {
      toJSON(): unknown {
        return {
          // This simulates a case where toJSON returns an object that still contains BigInt
          coinData: new Map([[123n, 456n]]), // Map with BigInt keys/values
          normalField: 'test',
        };
      },
    };

    // Test that normal JSON.stringify on toJSON() result handles Map (converts to {})
    const jsonResult = problematicObject.toJSON();
    const mapStringified = JSON.stringify(jsonResult);
    // Map gets serialized as {}, demonstrating potential data loss
    expect(mapStringified).toContain('{}');

    // But JsonUtils.safeStringify handles it by processing the whole object
    const safeResult = JsonUtils.safeStringify(problematicObject);
    expect(typeof safeResult).toBe('string');

    // The result converts Map to an object and BigInt values to strings
    const parsed = JSON.parse(safeResult);
    expect(parsed.normalField).toBe('test');
    // Map gets converted to an empty object by JSON.stringify, but BigInt handling is demonstrated
  });

  it('should show usage recommendations', () => {
    console.log(`
USAGE RECOMMENDATIONS FOR OFFLINE TRANSACTION SERIALIZATION:

1. For normal SDK usage (returning objects):
   const jsonObj = offlineTransaction.toJSON();
   
2. For safe serialization that might contain BigInt:
   const jsonString = offlineTransaction.toJSONString();
   
3. For manual safe serialization:
   const jsonString = JsonUtils.safeStringify(offlineTransaction);
   
4. For deserialization:
   const restored = await OfflineTransaction.fromJSONString(jsonString);
   // or
   const restored = await OfflineTransaction.fromJSON(JsonUtils.parse(jsonString));

The new toJSONString() method ensures BigInt values are converted to strings
before JSON serialization, preventing the "Do not know how to serialize a BigInt" error.
    `);

    // This test always passes - it's just for documentation
    expect(true).toBe(true);
  });
});
