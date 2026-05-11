import { DataHash } from '../../../crypto/hash/DataHash.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { EncodedPredicate } from '../../EncodedPredicate.js';
import { BuiltInPredicateType } from '../BuiltInPredicateType.js';

export interface IBuiltInPredicateVerifier {
  get type(): BuiltInPredicateType;

  verify(
    predicate: EncodedPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>>;
}
