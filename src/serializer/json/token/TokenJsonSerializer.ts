import { ITokenStateJson, TokenStateJsonSerializer } from './TokenStateJsonSerializer.js';
import { ISerializable } from '../../../ISerializable.js';
import { IPredicateFactory } from '../../../predicate/IPredicateFactory.js';
import { Token, TOKEN_VERSION } from '../../../token/Token.js';
import { MintTransactionData } from '../../../transaction/MintTransactionData.js';
import { Transaction } from '../../../transaction/Transaction.js';
import { TransactionData } from '../../../transaction/TransactionData.js';
import { ITokenSerializer } from '../../token/ITokenSerializer.js';
import { ITransactionJson } from '../transaction/ITransactionJson.js';
import { IMintTransactionDataJson } from '../transaction/MintTransactionDataJsonSerializer.js';
import { MintTransactionJsonSerializer } from '../transaction/MintTransactionJsonSerializer.js';
import { ITransactionDataJson } from '../transaction/TransactionDataJsonSerializer.js';
import { TransactionJsonSerializer } from '../transaction/TransactionJsonSerializer.js';

/**
 * JSON representation of a {@link Token}.
 */
export interface ITokenJson {
  readonly version: string;
  readonly state: ITokenStateJson;
  readonly genesis: ITransactionJson<IMintTransactionDataJson>;
  readonly transactions: ITransactionJson<ITransactionDataJson>[];
  readonly nametagTokens: ITokenJson[];
}

/**
 * A serializer for {@link Token} objects using JSON encoding.
 * Handles serialization and deserialization of tokens, including their transactions and state.
 */
export class TokenJsonSerializer implements ITokenSerializer {
  private readonly mintTransactionDeserializer: MintTransactionJsonSerializer;
  private readonly transactionSerializer: TransactionJsonSerializer;
  private readonly stateSerializer: TokenStateJsonSerializer;

  /**
   * Constructs a new `TokenJsonSerializer` instance.
   *
   * @param {IPredicateFactory} predicateFactory - A factory for creating predicates used in token serialization.
   */
  public constructor(private readonly predicateFactory: IPredicateFactory) {
    this.mintTransactionDeserializer = new MintTransactionJsonSerializer(this);
    this.transactionSerializer = new TransactionJsonSerializer(predicateFactory);
    this.stateSerializer = new TokenStateJsonSerializer(predicateFactory);
  }

  /**
   * Serializes a `Token` object into a JSON representation.
   *
   * @param {Token<Transaction<MintTransactionData<ISerializable | null>>>} token - The token to serialize.
   * @returns {ITokenJson} The JSON representation of the token.
   */
  public static serialize(token: Token<Transaction<MintTransactionData<ISerializable | null>>>): ITokenJson {
    return {
      genesis: MintTransactionJsonSerializer.serialize(token.genesis),
      nametagTokens: [],
      state: TokenStateJsonSerializer.serialize(token.state),
      transactions: token.transactions.map((transaction) => TransactionJsonSerializer.serialize(transaction)),
      version: token.version,
    };
  }

  /**
   * Deserializes a JSON representation of a token into a `Token` object.
   *
   * @param {ITokenJson} data - The JSON data to deserialize.
   * @returns {Promise<Token<Transaction<MintTransactionData<ISerializable | null>>>>}
   *          A promise that resolves to the deserialized `Token` object.
   * @throws {Error} If the token version does not match the expected version.
   */
  public async deserialize(data: ITokenJson): Promise<Token<Transaction<MintTransactionData<ISerializable | null>>>> {
    const tokenVersion = data.version;
    if (tokenVersion !== TOKEN_VERSION) {
      throw new Error(`Cannot parse token. Version mismatch: ${tokenVersion} !== ${TOKEN_VERSION}`);
    }

    const mintTransaction = await this.mintTransactionDeserializer.deserialize(data.genesis);

    const transactions: Transaction<TransactionData>[] = [];
    for (const transaction of data.transactions) {
      transactions.push(
        await this.transactionSerializer.deserialize(
          mintTransaction.data.tokenId,
          mintTransaction.data.tokenType,
          transaction,
        ),
      );
    }

    // TODO: Add nametag tokens
    return new Token(
      await this.stateSerializer.deserialize(mintTransaction.data.tokenId, mintTransaction.data.tokenType, data.state),
      mintTransaction,
      transactions,
      [],
      tokenVersion,
    );
  }
}
