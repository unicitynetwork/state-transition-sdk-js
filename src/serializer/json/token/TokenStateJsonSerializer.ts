import { IPredicateJson } from '../../../predicate/IPredicate.js';
import { IPredicateFactory } from '../../../predicate/IPredicateFactory.js';
import { TokenId } from '../../../token/TokenId.js';
import { TokenState } from '../../../token/TokenState.js';
import { TokenType } from '../../../token/TokenType.js';
import { HexConverter } from '../../../util/HexConverter.js';

/** JSON representation of {@link TokenState}. */
export interface ITokenStateJson {
  readonly unlockPredicate: IPredicateJson;
  readonly data: string | null;
}

/**
 * A serializer for {@link TokenState} objects using JSON encoding.
 * Handles serialization and deserialization of token states.
 */
export class TokenStateJsonSerializer {
  /**
   * Constructs a new `TokenStateJsonSerializer` instance.
   *
   * @param {IPredicateFactory} predicateFactory - A factory for creating predicates used in token state deserialization.
   */
  public constructor(private readonly predicateFactory: IPredicateFactory) {}

  /**
   * Serializes a `TokenState` object into a JSON representation.
   *
   * @param {TokenState} state - The token state to serialize.
   * @returns {ITokenStateJson} The JSON representation of the token state.
   */
  public static serialize(state: TokenState): ITokenStateJson {
    const data = state.data;
    return {
      data: data ? HexConverter.encode(data) : null,
      unlockPredicate: state.unlockPredicate.toJSON(),
    };
  }

  /**
   * Deserializes a JSON representation into a `TokenState` object.
   *
   * @param {TokenId} tokenId - The ID of the token associated with the state.
   * @param {TokenType} tokenType - The type of the token associated with the state.
   * @param {ITokenStateJson} state - The JSON data to deserialize.
   * @returns {Promise<TokenState>} A promise that resolves to the deserialized `TokenState` object.
   */
  public async deserialize(tokenId: TokenId, tokenType: TokenType, state: ITokenStateJson): Promise<TokenState> {
    return TokenState.create(
      await this.predicateFactory.create(tokenId, tokenType, state.unlockPredicate),
      state.data ? HexConverter.decode(state.data) : null,
    );
  }
}
