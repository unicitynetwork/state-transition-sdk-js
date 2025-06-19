import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { ITokenDeserializer } from './ITokenDeserializer.js';
import { ISerializable } from '../../ISerializable.js';
import { IPredicateFactory } from '../../predicate/IPredicateFactory.js';
import { ITokenJson, Token, TOKEN_VERSION } from '../../token/Token.js';
import { TokenState } from '../../token/TokenState.js';
import { MintTransactionData } from '../../transaction/MintTransactionData.js';
import { Transaction } from '../../transaction/Transaction.js';
import { TransactionData } from '../../transaction/TransactionData.js';
import { MintTransactionJsonDeserializer } from '../transaction/MintTransactionJsonDeserializer.js';
import { TransactionJsonDeserializer } from '../transaction/TransactionJsonDeserializer.js';

export class TokenJsonDeserializer implements ITokenDeserializer {
  private readonly mintTransactionDeserializer: MintTransactionJsonDeserializer;
  private readonly transactionDeserializer: TransactionJsonDeserializer;

  public constructor(private readonly predicateFactory: IPredicateFactory) {
    this.mintTransactionDeserializer = new MintTransactionJsonDeserializer(this);
    this.transactionDeserializer = new TransactionJsonDeserializer(predicateFactory);
  }

  public async deserialize(data: ITokenJson): Promise<Token<Transaction<MintTransactionData<ISerializable | null>>>> {
    const tokenVersion = data.version;
    if (tokenVersion !== TOKEN_VERSION) {
      throw new Error(`Cannot parse token. Version mismatch: ${tokenVersion} !== ${TOKEN_VERSION}`);
    }

    const mintTransaction = await this.mintTransactionDeserializer.deserialize(data.genesis);

    const transactions: Transaction<TransactionData>[] = [];
    for (const transaction of data.transactions) {
      transactions.push(
        await this.transactionDeserializer.deserialize(
          mintTransaction.data.tokenId,
          mintTransaction.data.tokenType,
          transaction,
        ),
      );
    }

    // TODO: Add nametag tokens
    return new Token(
      await TokenState.create(
        await this.predicateFactory.create(
          mintTransaction.data.tokenId,
          mintTransaction.data.tokenType,
          data.state.unlockPredicate,
        ),
        data.state.data ? HexConverter.decode(data.state.data) : null,
      ),
      mintTransaction,
      transactions,
      [],
      tokenVersion,
    );
  }
}
