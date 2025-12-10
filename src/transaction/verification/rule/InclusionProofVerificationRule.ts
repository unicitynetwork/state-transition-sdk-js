import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { UnicityCertificateVerification } from '../../../api/bft/verification/UnicityCertificateVerification.js';
import { InclusionProof } from '../../../api/InclusionProof.js';
import { StateId } from '../../../api/StateId.js';
import { DataHash } from '../../../crypto/hash/DataHash.js';
import { PredicateVerifierFactory } from '../../../predicate/verification/PredicateVerifierFactory.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';

/**
 * Status codes for verifying an InclusionProof.
 */
export enum InclusionProofVerificationStatus {
  INVALID_TRUSTBASE = 'INVALID_TRUSTBASE',
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
    predicateVerifierFactory: PredicateVerifierFactory,
    inclusionProof: InclusionProof,
    stateId: StateId,
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

    const result = await inclusionProof.merkleTreePath.verify(stateId.toBitString().toBigInt());
    if (!result.isPathValid) {
      return new VerificationResult('InclusionProofVerificationRule', InclusionProofVerificationStatus.PATH_INVALID);
    }

    const certificationData = inclusionProof.certificationData;
    if (certificationData) {
      // TODO: Verify ownership
      const predicateVerificationResult = await predicateVerifierFactory.verify(
        certificationData.lockScript,
        inclusionProof,
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
          InclusionProofVerificationStatus.PATH_NOT_INCLUDED,
        );
      }
    }

    if (!result.isPathIncluded) {
      return new VerificationResult(
        'InclusionProofVerificationRule',
        InclusionProofVerificationStatus.PATH_NOT_INCLUDED,
      );
    }

    return new VerificationResult('InclusionProofVerificationRule', InclusionProofVerificationStatus.OK);
  }
}
