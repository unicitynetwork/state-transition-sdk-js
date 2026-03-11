import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { UnicityCertificateVerification } from '../../../api/bft/verification/UnicityCertificateVerification.js';
import { InclusionProof } from '../../../api/InclusionProof.js';
import { StateId } from '../../../api/StateId.js';
import { DataHash } from '../../../crypto/hash/DataHash.js';
import { PredicateVerifier } from '../../../predicate/verification/PredicateVerifier.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { ITransaction } from '../../ITransaction.js';

/**
 * Status codes for verifying an InclusionProof.
 */
export enum InclusionProofVerificationStatus {
  INVALID_TRUSTBASE = 'INVALID_TRUSTBASE',
  LEAF_VALUE_MISMATCH = 'LEAF_VALUE_MISMATCH',
  MISSING_CERTIFICATION_DATA = 'MISSING_CERTIFICATION_DATA',
  TRANSACTION_HASH_MISMATCH = 'TRANSACTION_HASH_MISMATCH',
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  PATH_NOT_INCLUDED = 'PATH_NOT_INCLUDED',
  PATH_INVALID = 'PATH_INVALID',
  OK = 'OK',
}

/**
 * Genesis verification rule.
 */
export class InclusionProofVerificationRule {
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifierFactory: PredicateVerifier,
    inclusionProof: InclusionProof,
    transaction: ITransaction,
  ): Promise<VerificationResult<InclusionProofVerificationStatus>> {
    const unicityCertificateVerificationResult = await UnicityCertificateVerification.verify(trustBase, inclusionProof);

    if (unicityCertificateVerificationResult.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.INVALID_TRUSTBASE,
        '',
        [unicityCertificateVerificationResult],
      );
    }

    const stateId = await StateId.fromTransaction(transaction);
    const result = await inclusionProof.merkleTreePath.verify(stateId.toBitString().toBigInt());
    if (!result.isPathValid) {
      return new VerificationResult('InclusionProofVerificationRule', InclusionProofVerificationStatus.PATH_INVALID);
    }

    if (!result.isPathIncluded) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.PATH_NOT_INCLUDED,
      );
    }

    const certificationData = inclusionProof.certificationData;
    if (!certificationData) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.MISSING_CERTIFICATION_DATA,
      );
    }

    if (!certificationData.transactionHash.equals(await transaction.calculateTransactionHash())) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.TRANSACTION_HASH_MISMATCH,
      );
    }

    const predicateVerificationResult = await predicateVerifierFactory.verify(
      certificationData.lockScript,
      certificationData.sourceStateHash,
      certificationData.transactionHash,
      certificationData.unlockScript,
    );
    if (predicateVerificationResult.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.NOT_AUTHENTICATED,
        '',
        [predicateVerificationResult],
      );
    }

    const leafValue = await certificationData.calculateLeafValue();
    const pathValue = inclusionProof.merkleTreePath.steps.at(0)?.data;
    if (!pathValue || !leafValue.equals(DataHash.fromImprint(pathValue))) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.LEAF_VALUE_MISMATCH,
      );
    }

    return new VerificationResult('InclusionProofVerificationRule', InclusionProofVerificationStatus.OK);
  }
}
