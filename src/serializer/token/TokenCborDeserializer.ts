import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';

import { ITokenDeserializer } from './ITokenDeserializer.js';
import { ISerializable } from '../../ISerializable.js';
import { IPredicateFactory } from '../../predicate/IPredicateFactory.js';
import { Token, TOKEN_VERSION } from '../../token/Token.js';
import { TokenState } from '../../token/TokenState.js';
import { MintTransactionData } from '../../transaction/MintTransactionData.js';
import { Transaction } from '../../transaction/Transaction.js';
import { TransactionData } from '../../transaction/TransactionData.js';
import { MintTransactionCborDeserializer } from '../transaction/MintTransactionCborDeserializer.js';
import { TransactionCborDeserializer } from '../transaction/TransactionCborDeserializer.js';

export class TokenCborDeserializer implements ITokenDeserializer {
  private readonly mintTransactionDeserializer: MintTransactionCborDeserializer;
  private readonly transactionDeserializer: TransactionCborDeserializer;

  public constructor(private readonly predicateFactory: IPredicateFactory) {
    this.mintTransactionDeserializer = new MintTransactionCborDeserializer(this);
    this.transactionDeserializer = new TransactionCborDeserializer(predicateFactory);
  }

  public async deserialize(bytes: Uint8Array): Promise<Token<Transaction<MintTransactionData<ISerializable | null>>>> {
    const data = CborDecoder.readArray(bytes);
    const tokenVersion = CborDecoder.readTextString(data[0]);
    if (tokenVersion !== TOKEN_VERSION) {
      throw new Error(`Cannot parse token. Version mismatch: ${tokenVersion} !== ${TOKEN_VERSION}`);
    }

    const mintTransaction = await this.mintTransactionDeserializer.deserialize(data[1]);
    const transactions: Transaction<TransactionData>[] = [];
    for (const transaction of CborDecoder.readArray(data[2])) {
      transactions.push(
        await this.transactionDeserializer.deserialize(
          mintTransaction.data.tokenId,
          mintTransaction.data.tokenType,
          transaction,
        ),
      );
    }

    const state = CborDecoder.readArray(data[3]);

    // TODO: Add nametag tokens
    return new Token(
      await TokenState.create(
        await this.predicateFactory.create(mintTransaction.data.tokenId, mintTransaction.data.tokenType, state[0]),
        CborDecoder.readByteString(state[1]),
      ),
      mintTransaction,
      transactions,
      [],
      tokenVersion,
    );
  }
}
