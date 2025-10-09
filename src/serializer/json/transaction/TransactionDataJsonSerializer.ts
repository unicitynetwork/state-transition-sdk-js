import { DataHash } from '../../../hash/DataHash.js';
import { IPredicateFactory } from '../../../predicate/IPredicateFactory.js';
import { TokenId } from '../../../token/TokenId.js';
import { TokenType } from '../../../token/TokenType.js';
import { TransactionData } from '../../../transaction/TransactionData.js';
import { HexConverter } from '../../../util/HexConverter.js';
import { ITokenJson } from '../token/TokenJsonSerializer.js';
import { ITokenStateJson, TokenStateJsonSerializer } from '../token/TokenStateJsonSerializer.js';

/** JSON representation of a {@link TransactionData}. */
export interface ITransactionDataJson {
  readonly sourceState: ITokenStateJson;
  readonly recipient: string;
  readonly salt: string;
  readonly dataHash: string | null;
  readonly message: string | null;
  readonly nameTags: ITokenJson[];
}

/**
 * A serializer for {@link TransactionData} objects using JSON encoding.
 * Handles serialization and deserialization of transaction data, including token states and metadata.
 */
export class TransactionDataJsonSerializer {
  private readonly tokenStateSerializer: TokenStateJsonSerializer;

  /**
   * Constructs a new `TransactionDataJsonSerializer` instance.
   *
   * @param {IPredicateFactory} predicateFactory - A factory for creating predicates used in token state deserialization.
   */
  public constructor(predicateFactory: IPredicateFactory) {
    this.tokenStateSerializer = new TokenStateJsonSerializer(predicateFactory);
  }

  /**
   * Serializes `TransactionData` into a JSON representation.
   *
   * @param data The `TransactionData` to serialize.
   * @returns JSON representation of the transaction data.
   */
  public static serialize(data: TransactionData): ITransactionDataJson {
    const message = data.message;

    return {
      dataHash: data.dataHash?.toJSON() ?? null,
      message: message ? HexConverter.encode(message) : null,
      nameTags: [],
      recipient: data.recipient,
      salt: HexConverter.encode(data.salt),
      sourceState: TokenStateJsonSerializer.serialize(data.sourceState),
    };
  }

  /**
   * Deserializes a JSON representation into a `TransactionData` object.
   *
   * @param tokenId The ID of the token associated with the transaction data.
   * @param tokenType The type of the token associated with the transaction data.
   * @param data The JSON data to deserialize.
   * @returns A promise that resolves to the deserialized `TransactionData` object.
   */
  public async deserialize(
    tokenId: TokenId,
    tokenType: TokenType,
    data: ITransactionDataJson,
  ): Promise<TransactionData> {
    return TransactionData.create(
      await this.tokenStateSerializer.deserialize(tokenId, tokenType, data.sourceState),
      data.recipient,
      HexConverter.decode(data.salt),
      data.dataHash ? DataHash.fromJSON(data.dataHash) : null,
      data.message ? HexConverter.decode(data.message) : null,
      [],
    );
  }
}
