import { CertifiedMintTransaction } from './CertifiedMintTransaction.js';
import { CertifiedTransferTransaction } from './CertifiedTransferTransaction.js';
import { TokenId } from './TokenId.js';
import { TokenType } from './TokenType.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { PredicateVerifier } from '../predicate/verification/PredicateVerifier.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { dedent } from '../util/StringUtils.js';
import { VerificationError } from '../verification/VerificationError.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';
import { CertifiedMintTransactionVerificationRule } from './verification/rule/CertifiedMintTransactionVerificationRule.js';
import { CertifiedTransferTransactionVerificationRule } from './verification/rule/CertifiedTransferTransactionVerificationRule.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

export class Token {
  private constructor(
    public readonly genesis: CertifiedMintTransaction,
    private readonly _transactions: CertifiedTransferTransaction[] = [],
  ) {}

  public get id(): TokenId {
    return this.genesis.tokenId;
  }

  public get transactions(): CertifiedTransferTransaction[] {
    return this._transactions.slice();
  }

  public get type(): TokenType {
    return this.genesis.tokenType;
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<Token> {
    const data = CborDeserializer.decodeArray(bytes);
    const transactions = CborDeserializer.decodeArray(data[1]);

    return new Token(
      await CertifiedMintTransaction.fromCBOR(data[0]),
      transactions.map((transaction) => CertifiedTransferTransaction.fromCBOR(transaction)),
    );
  }

  public static async mint(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifier,
    genesis: CertifiedMintTransaction,
  ): Promise<Token> {
    const token = new Token(genesis);
    const result = await token.verify(trustBase, predicateVerifier);
    if (result.status !== VerificationStatus.OK) {
      throw new VerificationError('Invalid token genesis', result);
    }

    return token;
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.genesis.toCBOR(),
      CborSerializer.encodeArray(...this._transactions.map((transaction) => transaction.toCBOR())),
    );
  }

  public toString(): string {
    return dedent`
      Token
        ${this.genesis.toString()}
        Transactions: [
          ${this._transactions.map((transaction) => transaction.toString()).join('\n')}
        ]`;
  }

  public async transfer(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifier,
    transaction: CertifiedTransferTransaction,
  ): Promise<Token> {
    const result = await CertifiedTransferTransactionVerificationRule.verify(
      trustBase,
      predicateVerifier,
      this,
      transaction,
    );
    if (result.status !== VerificationStatus.OK) {
      throw new VerificationError('Invalid transfer transaction', result);
    }

    const transactions = this.transactions.slice();
    transactions.push(transaction);

    return new Token(this.genesis, transactions);
  }

  public async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifier,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];
    const result = await CertifiedMintTransactionVerificationRule.verify(trustBase, predicateVerifier, this.genesis);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult('TokenVerification', VerificationStatus.FAIL, '', results);
    }

    const transferResults: VerificationResult<VerificationStatus>[] = [];
    for (let i = 0; i < this._transactions.length; i++) {
      const transaction = this._transactions[i];
      const token = new Token(this.genesis, this._transactions.slice(0, i));
      const result = await CertifiedTransferTransactionVerificationRule.verify(
        trustBase,
        predicateVerifier,
        token,
        transaction,
      );
      transferResults.push(result);

      if (result.status !== VerificationStatus.OK) {
        results.push(
          new VerificationResult(
            'TokenTransferVerification',
            VerificationStatus.FAIL,
            `Transaction[${i}] verification failed.`,
            transferResults,
          ),
        );

        return new VerificationResult('TokenVerification', VerificationStatus.FAIL, '', results);
      }
    }

    results.push(new VerificationResult('TokenTransferVerification', VerificationStatus.OK, ``, transferResults));

    return new VerificationResult('TokenVerification', VerificationStatus.OK, '', results);
  }
}
