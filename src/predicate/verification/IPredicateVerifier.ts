import { DataHash } from '../../crypto/hash/DataHash.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngine } from '../PredicateEngine.js';

export interface IPredicateVerifier {
  get engine(): PredicateEngine;

  verify(
    encodedPredicate: IPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>>;
}
