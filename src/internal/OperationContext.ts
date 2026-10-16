import { IVerificationContext } from '../transaction/verification/IVerificationContext.js';
import { VerificationContext } from '../transaction/verification/VerificationContext.js';

/**
 * The context of one verification operation: the caller's context with only the certificate verifier replaced by the
 * given operation scoped form (see `UnicityCertificateVerifier.beginOperation`), so that identical certificates and seals of
 * the token and of every nested token are authenticated once.
 *
 * The caller's properties are read once, **with the caller as receiver**, into a new plain context: a context whose getters
 * read `#private` state, a Proxy or anything `this`-bound keeps working (a prototype link to the caller would run its
 * getters on the new object and break them).
 *
 * @param {IVerificationContext} context The caller's context.
 * @param {UnicityCertificateVerifier} scoped The operation scoped verifier.
 * @returns {IVerificationContext} Context for one operation.
 */
export function scopedVerificationContext(
  context: IVerificationContext,
  scoped: IVerificationContext['unicityCertificateVerifier'],
): IVerificationContext {
  return Object.freeze(
    new VerificationContext(
      context.trustBase,
      context.predicateVerifier,
      scoped,
      context.mintJustificationVerifier,
      context.tokenIssuanceVerifier,
    ),
  );
}

/**
 * The context of one verification operation, see {@link scopedVerificationContext}. A verifier that does not scope (an
 * injected customization) keeps full control and the caller's context is returned as it is.
 *
 * @param {IVerificationContext} context The caller's context.
 * @returns {IVerificationContext} Context for one operation.
 */
export function beginOperationContext(context: IVerificationContext): IVerificationContext {
  const verifier = context.unicityCertificateVerifier;
  const scoped = verifier.beginOperation?.();
  return !scoped || scoped === verifier ? context : scopedVerificationContext(context, scoped);
}
