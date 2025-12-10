import { InclusionProof } from '../../api/InclusionProof.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { IPredicate } from '../IPredicate.js';

export interface IPredicateVerifier {
  verify(encodedPredicate: IPredicate, inclusionProof: InclusionProof): Promise<VerificationResult<VerificationStatus>>;
}
