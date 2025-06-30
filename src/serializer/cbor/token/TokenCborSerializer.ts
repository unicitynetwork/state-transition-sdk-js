import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';

import { TokenStateCborSerializer } from './TokenStateCborSerializer.js';
import { ISerializable } from '../../../ISerializable.js';
import { IPredicateFactory } from '../../../predicate/IPredicateFactory.js';
import { Token, TOKEN_VERSION } from '../../../token/Token.js';
import { MintTransactionData } from '../../../transaction/MintTransactionData.js';
import { Transaction } from '../../../transaction/Transaction.js';
import { TransactionData } from '../../../transaction/TransactionData.js';
import { ITokenSerializer } from '../../token/ITokenSerializer.js';
import { MintTransactionCborSerializer } from '../transaction/MintTransactionCborSerializer.js';
import { TransactionCborSerializer } from '../transaction/TransactionCborSerializer.js';

/**
 * A serializer for {@link Token} objects using CBOR encoding.
 * Handles serialization and deserialization of tokens, including their transactions and state.
 */
export class TokenCborSerializer implements ITokenSerializer {
  private readonly mintTransactionSerializer: MintTransactionCborSerializer;
  private readonly transactionSerializer: TransactionCborSerializer;
  private stateSerializer: TokenStateCborSerializer;

  /**
   * Constructs a new `TokenCborSerializer` instance.
   *
   * @param {IPredicateFactory} predicateFactory - A factory for creating predicates used in token serialization.
   */
  public constructor(private readonly predicateFactory: IPredicateFactory) {
    this.mintTransactionSerializer = new MintTransactionCborSerializer(this);
    this.transactionSerializer = new TransactionCborSerializer(predicateFactory);
    this.stateSerializer = new TokenStateCborSerializer(predicateFactory);
  }

  /**
   * Serializes a `Token` object into a CBOR-encoded byte array.
   *
   * @param {Token<Transaction<MintTransactionData<ISerializable | null>>>} token - The token to serialize.
   * @returns {Uint8Array} The CBOR-encoded representation of the token.
   */
  public static serialize(token: Token<Transaction<MintTransactionData<ISerializable | null>>>): Uint8Array {
    return CborEncoder.encodeArray([
      CborEncoder.encodeTextString(token.version),
      MintTransactionCborSerializer.serialize(token.genesis),
      CborEncoder.encodeArray(
        token.transactions.map((transaction) => TransactionCborSerializer.serialize(transaction)),
      ),
      TokenStateCborSerializer.serialize(token.state),
      CborEncoder.encodeArray(token.nametagTokens.map((token) => token.toCBOR())),
    ]);
  }

  /**
   * Deserializes a CBOR-encoded `Uint8Array` into a `Token` object.
   *
   * @param {Uint8Array} bytes - The CBOR-encoded data to deserialize.
   * @returns {Promise<Token<Transaction<MintTransactionData<ISerializable | null>>>>}
   *          A promise that resolves to the deserialized `Token` object.
   * @throws {Error} If the token version does not match the expected version.
   */
  public async deserialize(bytes: Uint8Array): Promise<Token<Transaction<MintTransactionData<ISerializable | null>>>> {
    const data = CborDecoder.readArray(bytes);
    const tokenVersion = CborDecoder.readTextString(data[0]);
    if (tokenVersion !== TOKEN_VERSION) {
      throw new Error(`Cannot parse token. Version mismatch: ${tokenVersion} !== ${TOKEN_VERSION}`);
    }

    const mintTransaction = await this.mintTransactionSerializer.deserialize(data[1]);
    const transactions: Transaction<TransactionData>[] = [];
    for (const transaction of CborDecoder.readArray(data[2])) {
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
      await this.stateSerializer.deserialize(mintTransaction.data.tokenId, mintTransaction.data.tokenType, data[3]),
      mintTransaction,
      transactions,
      [],
      tokenVersion,
    );
  }
}
