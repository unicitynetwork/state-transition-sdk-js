import { CertificationData } from '../../api/CertificationData.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';

export interface IPredicateVerifierFactory {
  readonly engine: PredicateEngine;

  verify(predicate: IPredicate, certificationData: CertificationData): Promise<VerificationResult<VerificationStatus>>;
}
