import { CertificationData } from '../../api/CertificationData.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { IPredicate } from '../IPredicate.js';

export interface IPredicateVerifierFactory {
  verify(predicate: IPredicate, certificationData: CertificationData): Promise<VerificationResult<VerificationStatus>>;
}
