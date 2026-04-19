import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { UnicityCertificateVerification } from '../../../api/bft/verification/UnicityCertificateVerification.js';
import { InclusionProof } from '../../../api/InclusionProof.js';
import { StateId } from '../../../api/StateId.js';
import { DataHash } from '../../../crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../crypto/hash/HashAlgorithm.js';
import { PredicateVerifierService } from '../../../predicate/verification/PredicateVerifierService.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { ITransaction } from '../../ITransaction.js';

/**
 * Status codes for verifying an InclusionProof.
 */
export enum InclusionProofVerificationStatus {
  INVALID_TRUSTBASE = 'INVALID_TRUSTBASE',
  MISSING_CERTIFICATION_DATA = 'MISSING_CERTIFICATION_DATA',
  TRANSACTION_HASH_MISMATCH = 'TRANSACTION_HASH_MISMATCH',
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  INCLUSION_CERTIFICATE_MISSING = 'INCLUSION_CERTIFICATE_MISSING',
  PATH_INVALID = 'PATH_INVALID',
  OK = 'OK',
}

/**
 * Genesis verification rule.
 */
export class InclusionProofVerificationRule {
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifierFactory: PredicateVerifierService,
    inclusionProof: InclusionProof,
    transaction: ITransaction,
  ): Promise<VerificationResult<InclusionProofVerificationStatus>> {
    if (!inclusionProof.inclusionCertificate) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.INCLUSION_CERTIFICATE_MISSING,
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

    const stateId = await StateId.fromTransaction(transaction);
    const result = await inclusionProof.inclusionCertificate.verify(
      stateId,
      certificationData.transactionHash,
      new DataHash(HashAlgorithm.SHA256, inclusionProof.unicityCertificate.inputRecord.hash),
    );
    if (!result) {
      return new VerificationResult('InclusionProofVerificationRule', InclusionProofVerificationStatus.PATH_INVALID);
    }

    const unicityCertificateVerificationResult = await UnicityCertificateVerification.verify(trustBase, inclusionProof);

    if (unicityCertificateVerificationResult.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.INVALID_TRUSTBASE,
        '',
        [unicityCertificateVerificationResult],
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

    return new VerificationResult('InclusionProofVerificationRule', InclusionProofVerificationStatus.OK);
  }
}
