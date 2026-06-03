import { PaymentAssetCollection } from './asset/PaymentAssetCollection.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { TokenSalt } from '../transaction/TokenSalt.js';
import { TokenType } from '../transaction/TokenType.js';

/**
 * Request to mint one new token as part of a token split.
 */
export class SplitTokenRequest {
  private constructor(
    public readonly recipient: IPredicate,
    public readonly tokenType: TokenType,
    public readonly assets: PaymentAssetCollection,
    public readonly salt: TokenSalt,
  ) {}

  /**
   * Create a SplitTokenRequest.
   *
   * @param {IPredicate} recipient Predicate that will lock the new token.
   * @param {PaymentAssetCollection} assets Assets the new token will receive.
   * @param {TokenType} tokenType Token type for the new token; defaults to a random token type.
   * @param {TokenSalt} salt Salt for the new token; defaults to a random 32-byte salt.
   * @returns {SplitTokenRequest} New request.
   */
  public static create(
    recipient: IPredicate,
    assets: PaymentAssetCollection,
    tokenType: TokenType = TokenType.generate(),
    salt: TokenSalt = TokenSalt.generate(),
  ): SplitTokenRequest {
    return new SplitTokenRequest(recipient, tokenType, assets, salt);
  }
}
