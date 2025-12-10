import { IPredicate } from '../IPredicate.js';
import { IPredicateVerifier } from './IPredicateVerifier.js';
import { InclusionProof } from '../../api/InclusionProof.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';

export class PredicateVerifierFactory {
  public constructor(private readonly factories: Map<bigint, IPredicateVerifier>) {}

  public verify(
    predicate: IPredicate,
    inclusionProof: InclusionProof,
  ): Promise<VerificationResult<VerificationStatus>> {
    const factory = this.factories.get(predicate.type);
    if (!factory) {
      throw new Error('Unsupported predicate type for verification.');
    }

    return factory.verify(predicate, inclusionProof);
  }
}
