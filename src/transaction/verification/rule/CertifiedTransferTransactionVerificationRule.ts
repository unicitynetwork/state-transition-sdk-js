import { InclusionProofVerificationRule, InclusionProofVerificationStatus } from './InclusionProofVerificationRule.js';
import { RootTrustBase } from '../../../api/bft/RootTrustBase.js';
import { PredicateVerifier } from '../../../predicate/verification/PredicateVerifier.js';
import { VerificationResult } from '../../../verification/VerificationResult.js';
import { VerificationStatus } from '../../../verification/VerificationStatus.js';
import { CertifiedTransferTransaction } from '../../CertifiedTransferTransaction.js';
import { ITransaction } from '../../ITransaction.js';
import { PayToScriptHash } from '../../PayToScriptHash.js';
import { Token } from '../../Token.js';

/**
 * Transfer transaction verification rule.
 */
export class CertifiedTransferTransactionVerificationRule {
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifier,
    token: Token,
    transaction: CertifiedTransferTransaction,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];
    let result: VerificationResult<unknown> = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      transaction.inclusionProof,
      transaction,
    );
    results.push(result);

    if (result.status !== InclusionProofVerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedTransferTransactionVerificationRule',
        VerificationStatus.FAIL,
        `Inclusion proof verification failed: ${result.status?.toString()}`,
        results,
      );
    }

    const latestTransaction: ITransaction = token.transactions.at(-1) ?? token.genesis;
    const payToScriptHash = await PayToScriptHash.create(transaction.lockScript);
    result = new VerificationResult(
      'RecipientVerificationRule',
      latestTransaction.recipient.equals(payToScriptHash) ? VerificationStatus.OK : VerificationStatus.FAIL,
    );
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedTransferTransactionVerificationRule',
        VerificationStatus.FAIL,
        'The transaction owner does not match the previous transaction recipient.',
        results,
      );
    }

    result = new VerificationResult(
      'SourceStateHashVerificationRule',
      await latestTransaction
        .calculateStateHash()
        .then((hash) => (hash.equals(transaction.sourceStateHash) ? VerificationStatus.OK : VerificationStatus.FAIL)),
    );
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'CertifiedTransferTransactionVerificationRule',
        VerificationStatus.FAIL,
        'The transaction source state hash does not match the previous transaction state.',
        results,
      );
    }

    return new VerificationResult('CertifiedTransferTransactionVerificationRule', VerificationStatus.OK, '', results);
  }
}
