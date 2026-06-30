import { CertifiedMintTransaction } from '../CertifiedMintTransaction.js';
import { ITokenIssuanceVerifier } from './ITokenIssuanceVerifier.js';
import { HexConverter } from '../../util/HexConverter.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';

/**
 * Registry that dispatches token verification to the right
 * {@link ITokenIssuanceVerifier} based on the token's type. A token type with no
 * registered verifier is accepted, unless `rejectUnregisteredTypes` is set, in
 * which case it is rejected.
 */
export class TokenIssuanceVerifierService {
  private readonly verifiers: Map<string, ITokenIssuanceVerifier> = new Map();

  /**
   * Create a token issuance verifier registry.
   *
   * @param {boolean} rejectUnregisteredTypes When true, reject any token whose type has no registered issuance verifier.
   */
  public constructor(private readonly rejectUnregisteredTypes: boolean = false) {}

  /**
   * Register a policy for its declared token type.
   *
   * @param {ITokenIssuanceVerifier} verifier Verifier to register.
   * @returns {TokenIssuanceVerifierService} This service for chaining.
   * @throws {Error} If a policy is already registered for the token type.
   */
  public register(verifier: ITokenIssuanceVerifier): this {
    const key = HexConverter.encode(verifier.tokenType.bytes);
    if (this.verifiers.has(key)) {
      throw new Error(`Duplicate token issuance verifier for token type ${verifier.tokenType.toString()}.`);
    }

    this.verifiers.set(key, verifier);
    return this;
  }

  /**
   * Verify a token's genesis against the policy registered for its type.
   *
   * @param {CertifiedMintTransaction} transaction Genesis mint transaction whose token data to verify.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  public async verify(transaction: CertifiedMintTransaction): Promise<VerificationResult<VerificationStatus>> {
    const verifier = this.verifiers.get(HexConverter.encode(transaction.tokenType.bytes));
    if (!verifier) {
      if (this.rejectUnregisteredTypes) {
        return new VerificationResult(
          'TokenIssuanceVerification',
          VerificationStatus.FAIL,
          `No token issuance verifier registered for token type ${transaction.tokenType.toString()}.`,
        );
      }

      return new VerificationResult('TokenIssuanceVerification', VerificationStatus.OK);
    }

    const result = await verifier.verify(transaction, this);
    return new VerificationResult('TokenIssuanceVerification', result.status, '', [result]);
  }
}
