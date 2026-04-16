import { CertifiedUnicityIdMintTransaction } from './CertifiedUnicityIdMintTransaction.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { CertifiedTransferTransaction } from '../transaction/CertifiedTransferTransaction.js';
import { TokenId } from '../transaction/TokenId.js';
import { TokenType } from '../transaction/TokenType.js';
import { CertifiedTransferTransactionVerificationRule } from '../transaction/verification/rule/CertifiedTransferTransactionVerificationRule.js';
import { CertifiedUnicityIdMintTransactionVerificationRule } from '../transaction/verification/rule/CertifiedUnicityIdMintTransactionVerificationRule.js';
import { dedent } from '../util/StringUtils.js';
import { VerificationError } from '../verification/VerificationError.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';

export class UnicityIdToken {
  private constructor(
    public readonly genesis: CertifiedUnicityIdMintTransaction,
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

  public static async fromCBOR(bytes: Uint8Array): Promise<UnicityIdToken> {
    const data = CborDeserializer.decodeArray(bytes);
    const transactions = CborDeserializer.decodeArray(data[1]);

    return new UnicityIdToken(
      await CertifiedUnicityIdMintTransaction.fromCBOR(data[0]),
      transactions.map((transaction) => CertifiedTransferTransaction.fromCBOR(transaction)),
    );
  }

  public static async mint(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    genesis: CertifiedUnicityIdMintTransaction,
  ): Promise<UnicityIdToken> {
    const token = new UnicityIdToken(genesis);
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
      UnicityIdToken
        ${this.genesis.toString()}
        Transactions: [
          ${this._transactions.map((transaction) => transaction.toString()).join('\n')}
        ]`;
  }

  // TODO: Make it updatable.
  // public async transfer(
  //   trustBase: RootTrustBase,
  //   predicateVerifier: PredicateVerifier,
  //   transaction: CertifiedTransferTransaction,
  // ): Promise<UnicityIdToken> {
  //   const result = await CertifiedTransferTransactionVerificationRule.verify(
  //     trustBase,
  //     predicateVerifier,
  //     this._transactions.at(-1) ?? this.genesis,
  //     transaction,
  //   );
  //   if (result.status !== VerificationStatus.OK) {
  //     throw new VerificationError('Invalid transfer transaction', result);
  //   }
  //
  //   const transactions = this.transactions.slice();
  //   transactions.push(transaction);
  //
  //   return new UnicityIdToken(this.genesis, transactions);
  // }

  public async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];
    const result = await CertifiedUnicityIdMintTransactionVerificationRule.verify(
      trustBase,
      predicateVerifier,
      this.genesis,
    );
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult('TokenVerification', VerificationStatus.FAIL, '', results);
    }

    const transferResults: VerificationResult<VerificationStatus>[] = [];
    for (let i = 0; i < this._transactions.length; i++) {
      const transaction = this._transactions[i];
      const result = await CertifiedTransferTransactionVerificationRule.verify(
        trustBase,
        predicateVerifier,
        i === 0 ? this.genesis : this._transactions[i - 1],
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
