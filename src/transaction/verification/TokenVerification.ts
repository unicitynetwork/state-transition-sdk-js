import { CertifiedMintTransactionVerificationRule } from './rule/CertifiedMintTransactionVerificationRule.js';
import { RootTrustBase } from '../../api/bft/RootTrustBase.js';
import { PredicateVerifierFactory } from '../../predicate/verification/PredicateVerifierFactory.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';
import { Token } from '../Token.js';

class TokenVerificationResult extends VerificationResult<VerificationStatus> {
  private constructor(status: VerificationStatus, results: VerificationResult<unknown>[]) {
    super('TokenVerification', status, '', results);
  }

  public static fail(results: VerificationResult<unknown>[]): TokenVerificationResult {
    return new TokenVerificationResult(VerificationStatus.FAIL, results);
  }

  public static ok(results: VerificationResult<unknown>[]): TokenVerificationResult {
    return new TokenVerificationResult(VerificationStatus.OK, results);
  }
}

export class TokenVerification {
  public static async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierFactory,
    token: Token,
  ): Promise<TokenVerificationResult> {
    const results: VerificationResult<unknown>[] = [];
    const result = await CertifiedMintTransactionVerificationRule.verify(trustBase, predicateVerifier, token.genesis);
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return TokenVerificationResult.fail(results);
    }

    return TokenVerificationResult.ok(results);
  }
}
