import { IPredicateVerifierFactory } from './IPredicateVerifierFactory.js';
import { CertificationData } from '../../api/CertificationData.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';

export class PredicateVerifier {
  public constructor(private readonly factories: Map<PredicateEngine, IPredicateVerifierFactory>) {}

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
