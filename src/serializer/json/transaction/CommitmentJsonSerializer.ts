import { ITransactionDataJson, TransactionDataJsonSerializer } from './TransactionDataJsonSerializer.js';
import { Authenticator, IAuthenticatorJson } from '../../../api/Authenticator.js';
import { RequestId } from '../../../api/RequestId.js';
import { IPredicateFactory } from '../../../predicate/IPredicateFactory.js';
import { TokenId } from '../../../token/TokenId.js';
import { TokenType } from '../../../token/TokenType.js';
import { Commitment } from '../../../transaction/Commitment.js';
import { TransactionData } from '../../../transaction/TransactionData.js';

/** JSON representation of an {@link Commitment}. */
export interface ICommitmentJson {
  readonly requestId: string;
  readonly transactionData: ITransactionDataJson;
  readonly authenticator: IAuthenticatorJson;
}

/**
 * A serializer for {@link Commitment} objects using JSON encoding.
 * Handles serialization and deserialization of commitments, including their associated transaction data.
 */
export class CommitmentJsonSerializer {
  private readonly transactionDataSerializer: TransactionDataJsonSerializer;

  /**
   * Constructs a new `CommitmentJsonSerializer` instance.
   *
   * @param {IPredicateFactory} predicateFactory - A factory for creating predicates used in transaction data deserialization.
   */
  public constructor(predicateFactory: IPredicateFactory) {
    this.transactionDataSerializer = new TransactionDataJsonSerializer(predicateFactory);
  }

  /**
   * Serializes a {@link Commitment} object into a JSON representation.
   *
   * @param {Commitment<TransactionData>} commitment - The commitment to serialize.
   * @returns {ICommitmentJson} The JSON representation of the commitment.
   */
  public static serialize(commitment: Commitment<TransactionData>): ICommitmentJson {
    return {
      authenticator: commitment.authenticator.toJSON(),
      requestId: commitment.requestId.toJSON(),
      transactionData: TransactionDataJsonSerializer.serialize(commitment.transactionData),
    };
  }

  /**
   * Deserializes a JSON representation into a {@link Commitment} object.
   *
   * @param {TokenId} tokenId - The ID of the token associated with the commitment.
   * @param {TokenType} tokenType - The type of the token associated with the commitment.
   * @param {ICommitmentJson} data - The JSON data to deserialize.
   * @returns {Promise<Commitment<TransactionData>>} A promise that resolves to the deserialized `Commitment` object.
   */
  public async deserialize(
    tokenId: TokenId,
    tokenType: TokenType,
    data: ICommitmentJson,
  ): Promise<Commitment<TransactionData>> {
    return new Commitment(
      RequestId.fromJSON(data.requestId),
      await this.transactionDataSerializer.deserialize(tokenId, tokenType, data.transactionData),
      Authenticator.fromJSON(data.authenticator),
    );
  }
}
