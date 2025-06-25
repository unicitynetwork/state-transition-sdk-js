import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';

import { MaskedPredicate } from '../../../../src/predicate/MaskedPredicate.js';
import { TokenCoinData } from '../../../../src/token/fungible/TokenCoinData.js';
import { Token } from '../../../../src/token/Token.js';
import { TokenId } from '../../../../src/token/TokenId.js';
import { TokenState } from '../../../../src/token/TokenState.js';
import { TokenType } from '../../../../src/token/TokenType.js';
import { MintTransactionData } from '../../../../src/transaction/MintTransactionData.js';
import { OfflineCommitment } from '../../../../src/transaction/OfflineCommitment.js';
import { OfflineTransaction } from '../../../../src/transaction/OfflineTransaction.js';
import { Transaction } from '../../../../src/transaction/Transaction.js';
import { TransactionData } from '../../../../src/transaction/TransactionData.js';

// Create a simple test token data class
class TestTokenData {
  public constructor(private data: Uint8Array) {}

  public static fromJSON(data: unknown): Promise<TestTokenData> {
    if (typeof data !== 'string') {
      throw new Error('Invalid test token data');
    }
    return Promise.resolve(new TestTokenData(new Uint8Array()));
  }

  public toCBOR(): Uint8Array {
    return this.data;
  }

  public toJSON(): string {
    return 'test-data';
  }
}

describe('OfflineTransaction BigInt Test', () => {
  it('should test OfflineTransaction JSON serialization for BigInt issues', async () => {
    // Create minimal test objects
    const tokenId = TokenId.create(new Uint8Array(32).fill(1));
    const tokenType = TokenType.create(new Uint8Array(32).fill(2));
    const testData = new TestTokenData(new Uint8Array(32).fill(3));
    const coinData = new TokenCoinData([[123n, 456n]]);

    // Create predicate
    const signingService = await SigningService.createFromSecret(
      new Uint8Array(32).fill(4),
      new Uint8Array(32).fill(5),
    );
    const predicate = await MaskedPredicate.create(
      tokenId,
      tokenType,
      signingService,
      HashAlgorithm.SHA256,
      new Uint8Array(32).fill(5),
    );

    // Create token state
    const tokenState = await TokenState.create(predicate, new Uint8Array(32).fill(6));

    // Create a minimal token with a mint transaction
    const mintData = new MintTransactionData(
      tokenId,
      tokenType,
      testData,
      coinData,
      tokenState,
      'recipient-address',
      new Uint8Array(32).fill(7),
      null,
      new Uint8Array(32).fill(8),
      null,
      [],
    );

    const requestId = await RequestId.create(signingService.publicKey, tokenState.hash);
    const authenticator = await Authenticator.create(signingService, mintData.hash, tokenState.hash);

    // Create minimal inclusion proof
    const inclusionProof = new InclusionProof(
      new Uint8Array(32).fill(9),
      [],
      authenticator,
      new Uint8Array(32).fill(10),
    );

    const mintTransaction = new Transaction(mintData, inclusionProof);

    const token = new Token(tokenState, mintTransaction, [], []);

    // Create transaction data for the offline transaction
    const transactionData = await TransactionData.create(
      tokenState,
      'new-recipient-address',
      new Uint8Array(32).fill(11),
      null,
      new Uint8Array().fill(12),
      [],
    );

    // Create offline commitment
    const offlineCommitment = new OfflineCommitment(requestId, transactionData, authenticator);

    // Create offline transaction
    const offlineTransaction = new OfflineTransaction(offlineCommitment, token);

    // Test toJSON
    console.log('Testing OfflineTransaction.toJSON()...');
    const jsonResult = offlineTransaction.toJSON();
    console.log('toJSON() succeeded, result type:', typeof jsonResult);

    // Test JSON.stringify on the result
    console.log('Testing JSON.stringify on toJSON() result...');
    try {
      const stringified = JSON.stringify(jsonResult);
      console.log('JSON.stringify succeeded, length:', stringified.length);

      // Test parsing back
      const parsed = JSON.parse(stringified);
      console.log('JSON.parse succeeded');

      // Test deserializing
      console.log('Testing OfflineTransaction.fromJSON...');
      await OfflineTransaction.fromJSON(parsed);
      console.log('fromJSON succeeded');
    } catch (error) {
      console.log('JSON.stringify error:', error.message);
      console.log('This indicates BigInt values in the JSON structure');
    }

    // Test direct JSON.stringify on the OfflineTransaction object
    console.log('Testing direct JSON.stringify on OfflineTransaction...');
    try {
      JSON.stringify(offlineTransaction);
      console.log('Direct JSON.stringify succeeded (unexpected!)');
    } catch (error) {
      console.log('Direct JSON.stringify error (expected):', error.message);
    }
  });
});
