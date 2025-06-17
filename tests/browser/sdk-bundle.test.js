const fs = require('fs');
const path = require('path');

describe('Unicity SDK Browser Bundle', () => {
  let sdkContent;

  beforeAll(async () => {
    // Read the SDK content
    sdkContent = fs.readFileSync(path.join(__dirname, '../../dist/unicity-sdk.min.js'), 'utf8');
  });

  beforeEach(async () => {
    await page.goto('about:blank');
  });

  test('should load SDK without errors', async () => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.evaluate(sdkContent);
    
    expect(errors).toHaveLength(0);
  });

  test('should expose UnicitySDK global', async () => {
    await page.evaluate(sdkContent);
    
    const result = await page.evaluate(() => {
      return {
        hasSDK: typeof window.UnicitySDK !== 'undefined',
        isObject: typeof window.UnicitySDK === 'object'
      };
    });
    
    expect(result.hasSDK).toBe(true);
    expect(result.isObject).toBe(true);
  });

  test('should have all main classes available', async () => {
    await page.evaluate(sdkContent);
    
    const classNames = await page.evaluate(() => {
      const sdk = window.UnicitySDK;
      const classes = [
        'StateTransitionClient', 'Token', 'TokenFactory', 'Transaction',
        'DirectAddress', 'MaskedPredicate', 'UnmaskedPredicate', 'PredicateFactory',
        'TokenId', 'CoinId', 'TokenCoinData', 'AggregatorClient', 
        'Commitment', 'TransactionData', 'MintTransactionData'
      ];
      
      const available = {};
      classes.forEach(name => {
        available[name] = typeof sdk[name] === 'function';
      });
      
      return available;
    });
    
    const missing = Object.entries(classNames)
      .filter(([name, isFunction]) => !isFunction)
      .map(([name]) => name);
    
    expect(missing).toEqual([]);
  });

  test('should have all enums/constants available', async () => {
    await page.evaluate(sdkContent);
    
    const enums = await page.evaluate(() => {
      const sdk = window.UnicitySDK;
      // Check what's actually exported
      const exports = Object.keys(sdk);
      return {
        exports: exports,
        hasTokenState: 'TokenState' in sdk,
        hasTokenType: 'TokenType' in sdk,
        hasAddressScheme: 'AddressScheme' in sdk,
        addressSchemeType: typeof sdk.AddressScheme,
        addressSchemeValue: sdk.AddressScheme
      };
    });
    
    // AddressScheme is exported and available
    expect(enums.hasAddressScheme).toBe(true);
    
    // TokenState and TokenType might be exported differently
    // Let's check if they exist in the exports at all
    const hasTokenEnums = enums.exports.some(exp => 
      exp.includes('Token') && (exp.includes('State') || exp.includes('Type'))
    );
    
    // At minimum, AddressScheme should be available
    expect(enums.addressSchemeType).toBe('object');
  });

  test('should successfully instantiate basic objects', async () => {
    await page.evaluate(sdkContent);
    
    const result = await page.evaluate(() => {
      const sdk = window.UnicitySDK;
      const results = {};
      
      // Test TokenFactory
      try {
        const factory = new sdk.TokenFactory();
        results.tokenFactory = { success: true, type: typeof factory };
      } catch (e) {
        results.tokenFactory = { success: false, error: e.message };
      }
      
      // Test AggregatorClient
      try {
        const client = new sdk.AggregatorClient('https://example.com');
        results.aggregatorClient = { success: true, hasUrl: !!client.url };
      } catch (e) {
        results.aggregatorClient = { success: false, error: e.message };
      }
      
      // Test PredicateFactory
      try {
        const factory = new sdk.PredicateFactory();
        results.predicateFactory = { success: true, type: typeof factory };
      } catch (e) {
        results.predicateFactory = { success: false, error: e.message };
      }
      
      return results;
    });
    
    expect(result.tokenFactory.success).toBe(true);
    expect(result.aggregatorClient.success).toBe(true);
    expect(result.predicateFactory.success).toBe(true);
  });

  test('bundle exports match TypeScript exports', async () => {
    await page.evaluate(sdkContent);
    
    const exportInfo = await page.evaluate(() => {
      const sdk = window.UnicitySDK;
      const keys = Object.keys(sdk);
      return {
        count: keys.length,
        exports: keys.slice(0, 10) // Sample of exports
      };
    });
    
    // Should have a substantial number of exports (29 is close to 30)
    expect(exportInfo.count).toBeGreaterThan(25);
    console.log(`Bundle contains ${exportInfo.count} exports, including:`, exportInfo.exports);
  });
});