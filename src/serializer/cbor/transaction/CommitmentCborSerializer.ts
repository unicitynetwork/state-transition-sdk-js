import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';

import { TransactionDataCborSerializer } from './TransactionDataCborSerializer.js';
import { IPredicateFactory } from '../../../predicate/IPredicateFactory.js';
import { TokenId } from '../../../token/TokenId.js';
import { TokenType } from '../../../token/TokenType.js';
import { Commitment } from '../../../transaction/Commitment.js';
import { TransactionData } from '../../../transaction/TransactionData.js';

/**
 * A serializer for {@link Commitment} objects using CBOR encoding.
 * Handles serialization and deserialization of commitments, including their associated transaction data.
 */
export class CommitmentCborSerializer {
  private readonly transactionDataSerializer: TransactionDataCborSerializer;

  /**
   * Constructs a new `CommitmentCborSerializer` instance.
   *
   * @param {IPredicateFactory} predicateFactory - A factory for creating predicates used in transaction data deserialization.
   */
  public constructor(predicateFactory: IPredicateFactory) {
    this.transactionDataSerializer = new TransactionDataCborSerializer(predicateFactory);
  }

  /**
   * Serializes a {@link Commitment} object into a CBOR-encoded byte array.
   *
   * @param {Commitment<TransactionData>} commitment - The commitment to serialize.
   * @returns {Uint8Array} The CBOR-encoded representation of the commitment.
   */
  public static serialize(commitment: Commitment<TransactionData>): Uint8Array {
    return CborEncoder.encodeArray([
      commitment.requestId.toCBOR(),
      TransactionDataCborSerializer.serialize(commitment.transactionData),
      commitment.authenticator.toCBOR(),
    ]);
  }

  /**
   * Deserializes a CBOR-encoded byte array into a {@link Commitment} object.
   *
   * @param {TokenId} tokenId - The ID of the token associated with the commitment.
   * @param {TokenType} tokenType - The type of the token associated with the commitment.
   * @param {Uint8Array} bytes - The CBOR-encoded data to deserialize.
   * @returns {Promise<Commitment<TransactionData>>} A promise that resolves to the deserialized `Commitment` object.
   */
  public async deserialize(
    tokenId: TokenId,
    tokenType: TokenType,
    bytes: Uint8Array,
  ): Promise<Commitment<TransactionData>> {
    const data = CborDecoder.readArray(bytes);
    return new Commitment(
      RequestId.fromCBOR(data[0]),
      await this.transactionDataSerializer.deserialize(tokenId, tokenType, data[1]),
      Authenticator.fromCBOR(data[2]),
    );
  }
}
