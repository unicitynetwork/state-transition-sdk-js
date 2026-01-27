import { BurnPredicate } from './BurnPredicate.js';
import { BuiltInPredicateVerifierFactory } from '../../../predicate/builtin/BuiltInPredicateVerifierFactory.js';
import { PayToPublicKeyPredicate } from '../../../predicate/builtin/PayToPublicKeyPredicate.js';
import { PayToPublicKeyPredicateVerifier } from '../../../predicate/builtin/verification/PayToPublicKeyPredicateVerifier.js';
import { IPredicateVerifier } from '../../../predicate/verification/IPredicateVerifier.js';

export class PaymentPredicateVerifierFactory extends BuiltInPredicateVerifierFactory {
  public constructor(factories: Map<bigint, IPredicateVerifier>) {
    super(factories);
  }

  public static create(): PaymentPredicateVerifierFactory {
    return new BuiltInPredicateVerifierFactory(
      new Map([
        [PayToPublicKeyPredicate.TYPE, new PayToPublicKeyPredicateVerifier()],
        [BurnPredicate.TYPE, new PayToPublicKeyPredicateVerifier()],
      ]),
    );
  }
}
