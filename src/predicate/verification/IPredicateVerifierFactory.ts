import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';
import { PredicateVerifier } from './PredicateVerifier.js';
import { DataHash } from '../../crypto/hash/DataHash.js';

export interface IPredicateVerifierFactory {
  readonly engine: PredicateEngine;

  verify(
    verifier: PredicateVerifier,
    predicate: IPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>>;
}
