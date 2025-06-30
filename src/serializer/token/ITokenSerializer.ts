import { ISerializable } from '../../ISerializable.js';
import { Token } from '../../token/Token.js';
import { MintTransactionData } from '../../transaction/MintTransactionData.js';
import { Transaction } from '../../transaction/Transaction.js';

/**
 * Interface for token serializers capable of deserializing token transaction data.
 */
export interface ITokenSerializer {
  /**
   * Deserializes data into a Token.
   * @param data The data to deserialize.
   * @returns A Promise resolving to the deserialized Token.
   */
  deserialize(data: unknown): Promise<Token<Transaction<MintTransactionData<ISerializable | null>>>>;
}
