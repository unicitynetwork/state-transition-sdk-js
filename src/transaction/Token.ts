import { CertifiedMintTransaction } from './CertifiedMintTransaction.js';
import { CertifiedTransferTransaction } from './CertifiedTransferTransaction.js';
import { TokenVerification } from './verification/TokenVerification.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { PredicateVerifierFactory } from '../predicate/verification/PredicateVerifierFactory.js';
import { dedent } from '../util/StringUtils.js';
import { VerificationError } from '../verification/VerificationError.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';

export class Token {
  private constructor(
    public readonly genesis: CertifiedMintTransaction,
    private readonly _transactions: CertifiedTransferTransaction[] = [],
  ) {}

  public get transactions(): CertifiedTransferTransaction[] {
    return this._transactions.slice();
  }

  public static async mint(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierFactory,
    genesis: CertifiedMintTransaction,
  ): Promise<Token> {
    const token = new Token(genesis);
    const result = await TokenVerification.verify(trustBase, predicateVerifier, token);
    if (result.status !== VerificationStatus.OK) {
      throw new VerificationError('Invalid token genesis', result);
    }

    return token;
  }

  public toString(): string {
    return dedent`
      Token
        ${this.genesis.toString()}
        Transactions: [
          ${this._transactions.map((transaction) => transaction.toString()).join('\n')}
        ]`;
  }

  // TODO: Add verification of the transfer transaction
  public transfer(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierFactory,
    transaction: CertifiedTransferTransaction,
  ): Token {
    const transactions = this.transactions.slice();
    // transaction.inclusionProof.verify();
    transactions.push(transaction);

    return new Token(this.genesis, transactions);
  }
}
