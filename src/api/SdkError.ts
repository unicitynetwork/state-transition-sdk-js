const BRAND = Symbol.for('@unicitylabs/state-transition-sdk/error');

/**
 * Base of the errors of the newer SDK APIs.
 *
 * Every subclass has a **literal** `name`, so `error.name` narrows in a type guard, and every instance carries a
 * registry-wide brand, so that {@link SdkError.is} still recognizes an error that was created by another copy of the SDK
 * in the same bundle (where `instanceof` fails). Use the subclass's own `is()` (or its discriminant) to narrow further.
 */
export abstract class SdkError<N extends string = string> extends Error {
  public readonly [BRAND] = true as const;

  public abstract override readonly name: N;

  /**
   * @param {unknown} error Anything that was thrown.
   * @returns {boolean} True for an error created by this or another copy of the SDK.
   */
  public static is(error: unknown): error is SdkError {
    return typeof error === 'object' && error !== null && BRAND in error;
  }
}
