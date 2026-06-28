import { IPaymentData } from './IPaymentData.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { TokenSalt } from '../transaction/TokenSalt.js';

/**
 * Request to mint one new token as part of a token split. Splitting preserves
 * the source token type, so the output token type is not chosen here. The payment
 * data carries both the output's assets and its self-encoding, so each output may
 * embed its own token-type-specific payload alongside the asset allocation.
 */
export class SplitTokenRequest {
  private constructor(
    public readonly recipient: IPredicate,
    public readonly paymentData: IPaymentData,
    public readonly salt: TokenSalt,
  ) {}

  /**
   * Create a SplitTokenRequest.
   *
   * @param {IPredicate} recipient Predicate that will lock the new token.
   * @param {IPaymentData} paymentData Payment data the new token will carry; its assets are
   *   allocated from the source and its `encode()` produces the exact minted payload.
   * @param {TokenSalt} salt Salt for the new token; defaults to a random 32-byte salt.
   * @returns {SplitTokenRequest} New request.
   */
  public static create(
    recipient: IPredicate,
    paymentData: IPaymentData,
    salt: TokenSalt = TokenSalt.generate(),
  ): SplitTokenRequest {
    return new SplitTokenRequest(recipient, paymentData, salt);
  }
}
