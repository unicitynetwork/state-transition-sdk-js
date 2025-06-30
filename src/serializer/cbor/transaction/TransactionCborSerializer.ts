import { InclusionProof } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';

import { TransactionDataCborSerializer } from './TransactionDataCborSerializer.js';
import { IPredicateFactory } from '../../../predicate/IPredicateFactory.js';
import { TokenId } from '../../../token/TokenId.js';
import { TokenType } from '../../../token/TokenType.js';
import { Transaction } from '../../../transaction/Transaction.js';
import { TransactionData } from '../../../transaction/TransactionData.js';

/**
 * A serializer for {@link Transaction} containing {@link TransactionData} using CBOR encoding.
 * Handles serialization and deserialization of transactions.
 */
export class TransactionCborSerializer {
  private readonly dataSerializer: TransactionDataCborSerializer;

  /**
   * Constructs a new `TransactionCborSerializer` instance.
   *
   * @param {IPredicateFactory} predicateFactory - A factory for creating predicates used in transaction data deserialization.
   */
  public constructor(predicateFactory: IPredicateFactory) {
    this.dataSerializer = new TransactionDataCborSerializer(predicateFactory);
  }

  /**
   * Serializes a `Transaction` object containing `TransactionData` into a CBOR-encoded byte array.
   *
   * @param {Transaction<TransactionData>} transaction - The transaction to serialize.
   * @returns {Uint8Array} The CBOR-encoded representation of the transaction.
   */
  public static serialize(transaction: Transaction<TransactionData>): Uint8Array {
    return CborEncoder.encodeArray([
      TransactionDataCborSerializer.serialize(transaction.data),
      transaction.inclusionProof.toCBOR(),
    ]);
  }

  /**
   * Deserializes a CBOR-encoded `Uint8Array` into a `Transaction` object containing `TransactionData`.
   *
   * @param {TokenId} tokenId - The ID of the token associated with the transaction.
   * @param {TokenType} tokenType - The type of the token associated with the transaction.
   * @param {Uint8Array} bytes - The CBOR-encoded data to deserialize.
   * @returns {Promise<Transaction<TransactionData>>}
   *          A promise that resolves to the deserialized transaction.
   */
  public async deserialize(
    tokenId: TokenId,
    tokenType: TokenType,
    bytes: Uint8Array,
  ): Promise<Transaction<TransactionData>> {
    const transaction = CborDecoder.readArray(bytes);

    return new Transaction(
      await this.dataSerializer.deserialize(tokenId, tokenType, transaction[0]),
      InclusionProof.fromCBOR(transaction[1]),
    );
  }
}
