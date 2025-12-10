import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { StateId } from '../../../api/StateId.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { CertifiedTransferTransaction } from '../../CertifiedTransferTransaction.js';
import { Token } from '../../Token.js';

/**
 * Transfer transaction verification rule.
 */
export class CertifiedTransferTransactionVerificationRule {
  public static async verify(
    trustBase: RootTrustBase,
    token: Token,
    transaction: CertifiedTransferTransaction,
  ): Promise<VerificationResult<VerificationStatus>> {
    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      transaction.inclusionProof,
      await StateId.fromTransaction(transaction),
    );

    return new VerificationResult(
      'CertifiedMintTransactionVerificationRule',
      result.status === InclusionProofVerificationStatus.OK ? VerificationStatus.OK : VerificationStatus.FAIL,
      '',
      [result],
    );
  }
}
