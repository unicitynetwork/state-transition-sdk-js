import { ISerializable } from '../../ISerializable.js';
import { Token } from '../../token/Token.js';
import { MintTransactionData } from '../../transaction/MintTransactionData.js';
import { Transaction } from '../../transaction/Transaction.js';

export interface ITokenDeserializer {
  deserialize(data: unknown): Promise<Token<Transaction<MintTransactionData<ISerializable | null>>>>;
}
