import { DataHash } from '../../../crypto/hash/DataHash.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { IPredicate } from '../../IPredicate.js';
import { BuiltInPredicateType } from '../BuiltInPredicateType.js';

export interface IBuiltInPredicateVerifier {
  get type(): BuiltInPredicateType;

  verify(
    predicate: IPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>>;
}
