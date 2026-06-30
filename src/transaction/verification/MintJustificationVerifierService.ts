import { CertifiedMintTransaction } from '../CertifiedMintTransaction.js';
import { IMintJustificationVerifier } from './IMintJustificationVerifier.js';
import { IVerificationContext } from './IVerificationContext.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { VerificationResult } from '../../verification/VerificationResult.js';
import { VerificationStatus } from '../../verification/VerificationStatus.js';

/**
 * Registry that dispatches mint justification verification to the right
 * {@link IMintJustificationVerifier} based on the justification's CBOR tag.
 */
export class MintJustificationVerifierService {
  private readonly verifiers: Map<bigint, IMintJustificationVerifier> = new Map();

  /**
   * Register a verifier for its declared tag.
   *
   * @param {IMintJustificationVerifier} verifier Verifier to register.
   * @returns {MintJustificationVerifierService} This service for chaining.
   * @throws {Error} If a verifier is already registered for the tag.
   */
  public register(verifier: IMintJustificationVerifier): this {
    if (this.verifiers.has(verifier.tag)) {
      throw new Error(`Duplicate mint justification verifier for tag ${verifier.tag}.`);
    }

    this.verifiers.set(verifier.tag, verifier);
    return this;
  }

  /**
   * Verify given mint justification with registered verifiers.
   *
   * @param {CertifiedMintTransaction} transaction Certified mint transaction whose justification to verify.
   * @param {IVerificationContext} verificationContext Shared verification context for recursive verification.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  public async verify(
    transaction: CertifiedMintTransaction,
    verificationContext: IVerificationContext,
  ): Promise<VerificationResult<VerificationStatus>> {
    const bytes = transaction.justification;
    if (!bytes) {
      return new VerificationResult('MintJustificationVerification', VerificationStatus.OK);
    }

    const tag = CborDeserializer.decodeTag(bytes).tag;
    const verifier = this.verifiers.get(tag);
    if (!verifier) {
      return new VerificationResult(
        'MintJustificationVerification',
        VerificationStatus.FAIL,
        `Unsupported mint justification tag: ${tag}.`,
      );
    }

    const result = await verifier.verify(transaction, verificationContext);
    return new VerificationResult('MintJustificationVerification', result.status, '', [result]);
  }
}
