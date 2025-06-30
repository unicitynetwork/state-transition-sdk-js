import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';

import { ITransactionJson } from './ITransactionJson.js';
import { ITransactionDataJson, TransactionDataJsonSerializer } from './TransactionDataJsonSerializer.js';
import { IPredicateFactory } from '../../../predicate/IPredicateFactory.js';
import { TokenId } from '../../../token/TokenId.js';
import { TokenType } from '../../../token/TokenType.js';
import { Transaction } from '../../../transaction/Transaction.js';
import { TransactionData } from '../../../transaction/TransactionData.js';

/**
 * A serializer for {@link Transaction} containing {@link TransactionData} objects using JSON encoding.
 * Handles serialization and deserialization of transactions, including their data and inclusion proofs.
 */
export class TransactionJsonSerializer {
  private readonly dataSerializer: TransactionDataJsonSerializer;

  /**
   * Constructs a new `TransactionJsonSerializer` instance.
   *
   * @param predicateFactory A factory for creating predicates used in transaction data deserialization.
   */
  public constructor(predicateFactory: IPredicateFactory) {
    this.dataSerializer = new TransactionDataJsonSerializer(predicateFactory);
  }

  /**
   * Serializes a `Transaction` object containing `TransactionData` into a JSON representation.
   *
   * @param transaction The transaction to serialize.
   * @returns JSON representation of the transaction.
   */
  public static serialize(transaction: Transaction<TransactionData>): ITransactionJson<ITransactionDataJson> {
    return {
      data: TransactionDataJsonSerializer.serialize(transaction.data),
      inclusionProof: transaction.inclusionProof.toJSON(),
    };
  }

  /**
   * Deserializes a JSON representation of a transaction into a `Transaction` object containing `TransactionData`.
   *
   * @param tokenId The ID of the token associated with the transaction.
   * @param tokenType The type of the token associated with the transaction.
   * @param data The JSON data to deserialize.
   * @returns A promise that resolves to the deserialized transaction.
   */
  public async deserialize(
    tokenId: TokenId,
    tokenType: TokenType,
    { data, inclusionProof }: ITransactionJson<ITransactionDataJson>,
  ): Promise<Transaction<TransactionData>> {
    return new Transaction(
      await this.dataSerializer.deserialize(tokenId, tokenType, data),
      InclusionProof.fromJSON(inclusionProof),
    );
  }
}
