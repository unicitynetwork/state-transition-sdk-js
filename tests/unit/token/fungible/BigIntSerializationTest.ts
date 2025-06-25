import { TokenCoinData } from '../../../../src/token/fungible/TokenCoinData.js';

describe('BigInt JSON Serialization Investigation', () => {
  it('should investigate raw BigInt values in JSON output', () => {
    // Create a simple TokenCoinData with BigInt values
    const coinData = new TokenCoinData([[123n, 456n]]);

    // Test the toJSON method directly
    const tokenCoinJson = coinData.toJSON();
    console.log('TokenCoinData.toJSON():', tokenCoinJson);
    console.log('Type of first key:', typeof tokenCoinJson[0][0]);
    console.log('Type of first value:', typeof tokenCoinJson[0][1]);

    // Test what happens when we JSON.stringify the result
    const stringified = JSON.stringify(tokenCoinJson);
    console.log('JSON.stringify(tokenCoinJson):', stringified);

    // Parse it back and see what we get
    const parsed = JSON.parse(stringified);
    console.log('JSON.parse(stringified):', parsed);
    console.log('Type after parse - key:', typeof parsed[0][0]);
    console.log('Type after parse - value:', typeof parsed[0][1]);

    // Ensure TokenCoinData.toJSON() returns strings, not BigInt
    expect(typeof tokenCoinJson[0][0]).toBe('string');
    expect(typeof tokenCoinJson[0][1]).toBe('string');
  });

  it('should test if objects containing BigInt get corrupted', () => {
    // Create an object that might contain BigInt somewhere
    const objWithBigInt = {
      array: [456n, 'string'],
      bigIntValue: 123n,
      nested: {
        innerBigInt: 789n,
      },
      normalString: 'test',
    };

    console.log('Original object:', objWithBigInt);

    try {
      const stringified = JSON.stringify(objWithBigInt);
      console.log('JSON.stringify result:', stringified);

      const parsed = JSON.parse(stringified);
      console.log('Parsed back:', parsed);
    } catch (error) {
      console.log('JSON.stringify error:', error.message);
    }
  });

  it('should test JSON.stringify with replacer for BigInt', () => {
    const objWithBigInt = {
      array: [456n, 'string'],
      bigIntValue: 123n,
      normalString: 'test',
    };

    // Test with BigInt replacer
    const stringified = JSON.stringify(objWithBigInt, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    });

    console.log('JSON.stringify with BigInt replacer:', stringified);

    const parsed = JSON.parse(stringified);
    console.log('Parsed with replacer:', parsed);
  });
});
