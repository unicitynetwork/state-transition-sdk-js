import { IPredicateVerifierFactory } from './IPredicateVerifierFactory.js';
import { CertificationData } from '../../api/CertificationData.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { BuiltInPredicateVerifierFactory } from '../builtin/BuiltInPredicateVerifierFactory.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';

export class PredicateVerifier {
  private readonly factories: Map<PredicateEngine, IPredicateVerifierFactory>;
  public constructor(factories: IPredicateVerifierFactory[]) {
    const result = new Map<PredicateEngine, IPredicateVerifierFactory>();
    for (const factory of factories) {
      if (result.has(factory.engine)) {
        throw new Error('Found duplicate predicate verifier factory.');
      }

      result.set(factory.engine, factory);
    }

    this.factories = result;
  }

  public static create(): PredicateVerifier {
    return new PredicateVerifier([BuiltInPredicateVerifierFactory.create()]);
  }

  public verify(
    predicate: IPredicate,
    certificationData: CertificationData,
  ): Promise<VerificationResult<VerificationStatus>> {
    const factory = this.factories.get(predicate.engine);
    if (!factory) {
      throw new Error('Unsupported predicate engine.');
    }

    return factory.verify(predicate, certificationData);
  }
}
