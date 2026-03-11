import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateVerifier } from './PredicateVerifier.js';
import { DataHash } from '../../crypto/hash/DataHash.js';

export interface IPredicateVerifier {
  readonly type: bigint;

  verify(
    verifier: PredicateVerifier,
    encodedPredicate: IPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>>;
}
