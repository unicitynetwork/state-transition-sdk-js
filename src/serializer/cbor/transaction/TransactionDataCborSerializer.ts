import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';

import { IPredicateFactory } from '../../../predicate/IPredicateFactory.js';
import { TokenId } from '../../../token/TokenId.js';
import { TokenType } from '../../../token/TokenType.js';
import { TransactionData } from '../../../transaction/TransactionData.js';
import { TokenStateCborSerializer } from '../token/TokenStateCborSerializer.js';

/**
 * A serializer for {@link TransactionData} objects using CBOR encoding.
 * Handles serialization and deserialization of transaction data.
 */
export class TransactionDataCborSerializer {
  private readonly tokenStateSerializer: TokenStateCborSerializer;

  /**
   * Constructs a new `TransactionDataCborSerializer` instance.
   *
   * @param {IPredicateFactory} predicateFactory - A factory for creating predicates used in transaction data deserialization.
   */
  public constructor(predicateFactory: IPredicateFactory) {
    this.tokenStateSerializer = new TokenStateCborSerializer(predicateFactory);
  }

  /**
   * Serializes a `TransactionData` object into a CBOR-encoded byte array.
   *
   * @param {TransactionData} data - The transaction data to serialize.
   * @returns {Uint8Array} The CBOR-encoded representation of the transaction data.
   */
  public static serialize(data: TransactionData): Uint8Array {
    const message = data.message;

    return CborEncoder.encodeArray([
      TokenStateCborSerializer.serialize(data.sourceState),
      CborEncoder.encodeTextString(data.recipient),
      CborEncoder.encodeByteString(data.salt),
      data.dataHash?.toCBOR() ?? CborEncoder.encodeNull(),
      CborEncoder.encodeOptional(message, CborEncoder.encodeByteString),
      CborEncoder.encodeArray(data.nametagTokens.map((token) => token.toCBOR())),
    ]);
  }

  /**
   * Deserializes a CBOR-encoded `Uint8Array` into a `TransactionData` object.
   *
   * @param {TokenId} tokenId - The ID of the token associated with the transaction data.
   * @param {TokenType} tokenType - The type of the token associated with the transaction data.
   * @param {Uint8Array} bytes - The CBOR-encoded data to deserialize.
   * @returns {Promise<TransactionData>} A promise that resolves to the deserialized `TransactionData` object.
   */
  public async deserialize(tokenId: TokenId, tokenType: TokenType, bytes: Uint8Array): Promise<TransactionData> {
    const data = CborDecoder.readArray(bytes);

    return TransactionData.create(
      await this.tokenStateSerializer.deserialize(tokenId, tokenType, data[0]),
      CborDecoder.readTextString(data[1]),
      CborDecoder.readByteString(data[2]),
      CborDecoder.readOptional(data[3], DataHash.fromCBOR),
      CborDecoder.readOptional(data[4], CborDecoder.readByteString),
      [],
    );
  }
}
