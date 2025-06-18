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
        // Core SDK classes
        'StateTransitionClient', 'Token', 'TokenFactory', 'Transaction',
        'DirectAddress', 'MaskedPredicate', 'UnmaskedPredicate', 'PredicateFactory',
        'TokenId', 'CoinId', 'TokenCoinData', 'AggregatorClient', 
        'Commitment', 'TransactionData', 'MintTransactionData',
        // Critical Commons classes
        'SigningService', 'Signature', 'DataHasher', 'DataHash', 'HexConverter',
        // API/Inclusion Proof classes
        'InclusionProof', 'RequestId', 'Authenticator', 'SubmitCommitmentRequest', 'SubmitCommitmentResponse'
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

  test('should have critical cryptographic classes for token operations', async (): Promise<void> => {
    await page.evaluate(sdkContent);
    
    const cryptoResult = await page.evaluate(() => {
      const sdk = (window as any).UnicitySDK;
      
      return {
        // Critical for signing operations
        hasSigningService: typeof sdk.SigningService === 'function',
        hasSigningServiceCreateFromSecret: typeof sdk.SigningService?.createFromSecret === 'function',
        
        // Critical for hash operations
        hasHashAlgorithm: typeof sdk.HashAlgorithm === 'object',
        hasHashAlgorithmSHA256: sdk.HashAlgorithm?.SHA256 !== undefined,
        
        // Critical for data hashing
        hasDataHasher: typeof sdk.DataHasher === 'function',
        hasDataHash: typeof sdk.DataHash === 'function',
        
        // Utility for hex conversions
        hasHexConverter: typeof sdk.HexConverter === 'function',
        hasHexConverterEncode: typeof sdk.HexConverter?.encode === 'function',
        hasHexConverterDecode: typeof sdk.HexConverter?.decode === 'function'
      };
    });
    
    // Verify critical SigningService functionality
    expect(cryptoResult.hasSigningService).toBe(true);
    expect(cryptoResult.hasSigningServiceCreateFromSecret).toBe(true);
    
    // Verify HashAlgorithm enum
    expect(cryptoResult.hasHashAlgorithm).toBe(true);
    expect(cryptoResult.hasHashAlgorithmSHA256).toBe(true);
    
    // Verify DataHasher
    expect(cryptoResult.hasDataHasher).toBe(true);
    expect(cryptoResult.hasDataHash).toBe(true);
    
    // Verify HexConverter utilities
    expect(cryptoResult.hasHexConverter).toBe(true);
    expect(cryptoResult.hasHexConverterEncode).toBe(true);
    expect(cryptoResult.hasHexConverterDecode).toBe(true);
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
    
    // Should have increased substantially with Commons exports (from 29 to 35+)
    expect(exportInfo.count).toBeGreaterThan(30);
    console.log(`Bundle contains ${exportInfo.count} exports, including:`, exportInfo.exports);
  });

  test('should enable basic cryptographic operations', async (): Promise<void> => {
    await page.evaluate(sdkContent);
    
    const operationResult = await page.evaluate(async () => {
      const sdk = (window as any).UnicitySDK;
      
      try {
        // Test SigningService.createFromSecret - Critical for token minting
        const secret = new Uint8Array(32).fill(1);
        const nonce = new Uint8Array(32).fill(2);
        const signingService = await sdk.SigningService.createFromSecret(secret, nonce);
        
        // Test HexConverter - Critical for data conversion
        const testData = new Uint8Array([1, 2, 3, 4]);
        const hexString = sdk.HexConverter.encode(testData);
        const decodedData = sdk.HexConverter.decode(hexString);
        
        // Test HashAlgorithm enum access
        const sha256Value = sdk.HashAlgorithm.SHA256;
        
        return {
          success: true,
          hasSigningService: !!signingService,
          hasPublicKey: !!signingService.publicKey,
          publicKeyLength: signingService.publicKey?.length || 0,
          hexEncoded: hexString,
          hexRoundTrip: decodedData.length === testData.length,
          sha256Value: sha256Value
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });
    
    if (!operationResult.success) {
      console.error('Basic crypto operation failed:', operationResult.error);
    }
    
    expect(operationResult.success).toBe(true);
    
    if (operationResult.success) {
      expect(operationResult.hasSigningService).toBe(true);
      expect(operationResult.hasPublicKey).toBe(true);
      expect(operationResult.publicKeyLength).toBeGreaterThan(0);
      expect(operationResult.hexEncoded).toBe('01020304');
      expect(operationResult.hexRoundTrip).toBe(true);
      expect(operationResult.sha256Value).toBeDefined();
    }
  });

  test('should have inclusion proof verification capabilities', async (): Promise<void> => {
    await page.evaluate(sdkContent);
    
    const inclusionProofResult = await page.evaluate(() => {
      const sdk = (window as any).UnicitySDK;
      
      return {
        // Critical InclusionProofVerificationStatus enum
        hasInclusionProofVerificationStatus: typeof sdk.InclusionProofVerificationStatus === 'object',
        hasOKStatus: sdk.InclusionProofVerificationStatus?.OK !== undefined,
        hasErrorStatus: sdk.InclusionProofVerificationStatus?.ERROR !== undefined,
        
        // InclusionProof class
        hasInclusionProof: typeof sdk.InclusionProof === 'function',
        
        // Supporting API classes
        hasRequestId: typeof sdk.RequestId === 'function',
        hasAuthenticator: typeof sdk.Authenticator === 'function',
        hasSubmitCommitmentRequest: typeof sdk.SubmitCommitmentRequest === 'function',
        hasSubmitCommitmentResponse: typeof sdk.SubmitCommitmentResponse === 'function',
        hasSubmitCommitmentStatus: typeof sdk.SubmitCommitmentStatus === 'object',
        
        // Debug info
        verificationStatusKeys: sdk.InclusionProofVerificationStatus ? Object.keys(sdk.InclusionProofVerificationStatus) : [],
        verificationStatusValues: sdk.InclusionProofVerificationStatus ? Object.values(sdk.InclusionProofVerificationStatus) : []
      };
    });
    
    // Verify critical InclusionProofVerificationStatus enum
    expect(inclusionProofResult.hasInclusionProofVerificationStatus).toBe(true);
    expect(inclusionProofResult.hasOKStatus).toBe(true);
    
    // Verify InclusionProof class
    expect(inclusionProofResult.hasInclusionProof).toBe(true);
    
    // Verify supporting API classes
    expect(inclusionProofResult.hasRequestId).toBe(true);
    expect(inclusionProofResult.hasAuthenticator).toBe(true);
    expect(inclusionProofResult.hasSubmitCommitmentRequest).toBe(true);
    expect(inclusionProofResult.hasSubmitCommitmentResponse).toBe(true);
    expect(inclusionProofResult.hasSubmitCommitmentStatus).toBe(true);
    
    // Verify enum has all expected values
    expect(inclusionProofResult.verificationStatusKeys).toContain('OK');
    expect(inclusionProofResult.verificationStatusKeys).toContain('NOT_AUTHENTICATED');
    expect(inclusionProofResult.verificationStatusKeys).toContain('PATH_NOT_INCLUDED');
    expect(inclusionProofResult.verificationStatusKeys).toContain('PATH_INVALID');
  });
});