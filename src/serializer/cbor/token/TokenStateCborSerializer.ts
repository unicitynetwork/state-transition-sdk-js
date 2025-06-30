import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';

import { IPredicateFactory } from '../../../predicate/IPredicateFactory.js';
import { TokenId } from '../../../token/TokenId.js';
import { TokenState } from '../../../token/TokenState.js';
import { TokenType } from '../../../token/TokenType.js';

/**
 * A serializer for {@link TokenState} objects using CBOR encoding.
 * Handles serialization and deserialization of token states.
 */
export class TokenStateCborSerializer {
  /**
   * Constructs a new `TokenStateCborSerializer` instance.
   *
   * @param {IPredicateFactory} predicateFactory - A factory for creating predicates used in token state deserialization.
   */
  public constructor(private readonly predicateFactory: IPredicateFactory) {}

  /**
   * Serializes a `TokenState` object into a CBOR-encoded byte array.
   *
   * @param {TokenState} state - The token state to serialize.
   * @returns {Uint8Array} The CBOR-encoded representation of the token state.
   */
  public static serialize(state: TokenState): Uint8Array {
    return CborEncoder.encodeArray([
      state.unlockPredicate.toCBOR(),
      CborEncoder.encodeOptional(state.data, CborEncoder.encodeByteString),
    ]);
  }

  /**
   * Deserializes a CBOR-encoded `Uint8Array` into a `TokenState` object.
   *
   * @param {TokenId} tokenId - The ID of the token associated with the state.
   * @param {TokenType} tokenType - The type of the token associated with the state.
   * @param {Uint8Array} bytes - The CBOR-encoded data to deserialize.
   * @returns {Promise<TokenState>} A promise that resolves to the deserialized `TokenState` object.
   */
  public async deserialize(tokenId: TokenId, tokenType: TokenType, bytes: Uint8Array): Promise<TokenState> {
    const data = CborDecoder.readArray(bytes);
    return TokenState.create(
      await this.predicateFactory.create(tokenId, tokenType, data[0]),
      CborDecoder.readOptional(data[1], CborDecoder.readByteString),
    );
  }
}
