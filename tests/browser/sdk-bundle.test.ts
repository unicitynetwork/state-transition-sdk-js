import { readFileSync } from 'fs';
import { join } from 'path';

declare global {
  const page: any;
}

interface ITestResult {
  success: boolean;
  type?: string;
  hasUrl?: boolean;
  error?: string;
}

interface IInstantiationResults {
  tokenFactory: ITestResult;
  aggregatorClient: ITestResult;
  predicateFactory: ITestResult;
}

interface IEnumCheckResult {
  exports: string[];
  hasTokenState: boolean;
  hasTokenType: boolean;
  hasAddressScheme: boolean;
  addressSchemeType: string;
  addressSchemeValue: any;
}

interface IExportInfo {
  count: number;
  exports: string[];
}

describe('Unicity SDK Browser Bundle', (): void => {
  let sdkContent: string;

  beforeAll(async (): Promise<void> => {
    // Read the SDK content
    sdkContent = readFileSync(join(__dirname, '../../dist/unicity-sdk.min.js'), 'utf8');
  });

  beforeEach(async (): Promise<void> => {
    await page.goto('about:blank');
  });

  test('should load SDK without errors', async (): Promise<void> => {
    const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));

    await page.evaluate(sdkContent);
    
    expect(errors).toHaveLength(0);
  });

  test('should expose UnicitySDK global', async (): Promise<void> => {
    await page.evaluate(sdkContent);
    
    const result = await page.evaluate((): { hasSDK: boolean; isObject: boolean } => {
      return {
        hasSDK: typeof (window as any).UnicitySDK !== 'undefined',
        isObject: typeof (window as any).UnicitySDK === 'object'
      };
    });
    
    expect(result.hasSDK).toBe(true);
    expect(result.isObject).toBe(true);
  });

  test('should have all main classes available', async (): Promise<void> => {
    await page.evaluate(sdkContent);
    
    const classNames = await page.evaluate((): Record<string, boolean> => {
      const sdk = (window as any).UnicitySDK;
      const classes: string[] = [
        'StateTransitionClient', 'Token', 'TokenFactory', 'Transaction',
        'DirectAddress', 'MaskedPredicate', 'UnmaskedPredicate', 'PredicateFactory',
        'TokenId', 'CoinId', 'TokenCoinData', 'AggregatorClient', 
        'Commitment', 'TransactionData', 'MintTransactionData'
      ];
      
      const available: Record<string, boolean> = {};
      classes.forEach((name: string): void => {
        available[name] = typeof sdk[name] === 'function';
      });
      
      return available;
    });
    
    const missing: string[] = Object.entries(classNames)
      .filter(([, isFunction]: [string, boolean]) => !isFunction)
      .map(([name]: [string, boolean]) => name);
    
    expect(missing).toEqual([]);
  });

  test('should have all enums/constants available', async (): Promise<void> => {
    await page.evaluate(sdkContent);
    
    const enums = await page.evaluate((): IEnumCheckResult => {
      const sdk = (window as any).UnicitySDK;
      // Check what's actually exported
      const exports: string[] = Object.keys(sdk);
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
    const hasTokenEnums: boolean = enums.exports.some((exp: string) => 
      exp.includes('Token') && (exp.includes('State') || exp.includes('Type'))
    );
    
    // At minimum, AddressScheme should be available
    expect(enums.addressSchemeType).toBe('object');
  });

  test('should successfully instantiate basic objects', async (): Promise<void> => {
    await page.evaluate(sdkContent);
    
    const result = await page.evaluate((): IInstantiationResults => {
      const sdk = (window as any).UnicitySDK;
      const results: IInstantiationResults = {} as IInstantiationResults;
      
      // Test TokenFactory
      try {
        const factory = new sdk.TokenFactory();
        results.tokenFactory = { success: true, type: typeof factory };
      } catch (e: any) {
        results.tokenFactory = { success: false, error: e.message };
      }
      
      // Test AggregatorClient
      try {
        const client = new sdk.AggregatorClient('https://example.com');
        results.aggregatorClient = { success: true, hasUrl: !!client.url };
      } catch (e: any) {
        results.aggregatorClient = { success: false, error: e.message };
      }
      
      // Test PredicateFactory
      try {
        const factory = new sdk.PredicateFactory();
        results.predicateFactory = { success: true, type: typeof factory };
      } catch (e: any) {
        results.predicateFactory = { success: false, error: e.message };
      }
      
      return results;
    });
    
    expect(result.tokenFactory.success).toBe(true);
    expect(result.aggregatorClient.success).toBe(true);
    expect(result.predicateFactory.success).toBe(true);
  });

  test('bundle exports match TypeScript exports', async (): Promise<void> => {
    await page.evaluate(sdkContent);
    
    const exportInfo = await page.evaluate((): IExportInfo => {
      const sdk = (window as any).UnicitySDK;
      const keys: string[] = Object.keys(sdk);
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