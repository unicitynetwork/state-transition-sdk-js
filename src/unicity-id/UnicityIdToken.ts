import { CertifiedUnicityIdMintTransaction } from './CertifiedUnicityIdMintTransaction.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { TokenId } from '../transaction/TokenId.js';
import { TokenType } from '../transaction/TokenType.js';
import { CertifiedUnicityIdMintTransactionVerificationRule } from '../transaction/verification/rule/CertifiedUnicityIdMintTransactionVerificationRule.js';
import { dedent } from '../util/StringUtils.js';
import { VerificationError } from '../verification/VerificationError.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';

/**
 * Token whose id is derived from a {@link UnicityId}, used to authorize
 * spends bound to that unicity id.
 */
export class UnicityIdToken {
  private constructor(public readonly genesis: CertifiedUnicityIdMintTransaction) {}

  /**
   * @returns {TokenId} Token id.
   */
  public get id(): TokenId {
    return this.genesis.tokenId;
  }

  /**
   * @returns {TokenType} Token type.
   */
  public get type(): TokenType {
    return this.genesis.tokenType;
  }

  /**
   * Create UnicityIdToken from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {Promise<UnicityIdToken>} Decoded token.
   */
  public static async fromCBOR(bytes: Uint8Array): Promise<UnicityIdToken> {
    const data = CborDeserializer.decodeArray(bytes, 1);

    return new UnicityIdToken(await CertifiedUnicityIdMintTransaction.fromCBOR(data[0]));
  }

  /**
   * Create a UnicityIdToken from a verified genesis transaction.
   *
   * @param {RootTrustBase} trustBase Root trust base used to verify the inclusion certificate.
   * @param {PredicateVerifierService} predicateVerifier Verifier for embedded predicates.
   * @param {CertifiedUnicityIdMintTransaction} genesis Genesis mint transaction.
   * @returns {Promise<UnicityIdToken>} New token.
   * @throws {VerificationError} If the genesis does not verify.
   */
  public static async mint(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    genesis: CertifiedUnicityIdMintTransaction,
  ): Promise<UnicityIdToken> {
    const token = new UnicityIdToken(genesis);
    const result = await CertifiedUnicityIdMintTransactionVerificationRule.verify(
      trustBase,
      predicateVerifier,
      genesis,
    );
    if (result.status !== VerificationStatus.OK) {
      throw new VerificationError('Invalid token genesis', result);
    }

    return token;
  }

  /**
   * Convert UnicityIdToken to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.genesis.toCBOR());
  }

  /**
   * @returns {string} String representation of the token.
   */
  public toString(): string {
    return dedent`
      UnicityIdToken
        ${this.genesis.toString()}`;
  }

  /**
   * Verify this token's against the trust base and issuer key.
   *
   * @param {RootTrustBase} trustBase Root trust base.
   * @param {PredicateVerifierService} predicateVerifier Verifier for embedded predicates.
   * @param {Uint8Array} issuerPublicKey Expected issuer public key.
   * @returns {Promise<VerificationResult<VerificationStatus>>} Verification outcome.
   */
  public async verify(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    issuerPublicKey: Uint8Array,
  ): Promise<VerificationResult<VerificationStatus>> {
    const results: VerificationResult<unknown>[] = [];
    const result = await CertifiedUnicityIdMintTransactionVerificationRule.verify(
      trustBase,
      predicateVerifier,
      this.genesis,
      issuerPublicKey,
    );
    results.push(result);
    if (result.status !== VerificationStatus.OK) {
      return new VerificationResult('TokenVerification', VerificationStatus.FAIL, '', results);
    }

    return new VerificationResult('TokenVerification', VerificationStatus.OK, '', results);
  }
}
