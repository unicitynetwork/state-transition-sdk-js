import { UnicityId } from './UnicityId.js';
import { UnicityIdMintTransaction } from './UnicityIdMintTransaction.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { NetworkId } from '../api/NetworkId.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { SignaturePredicate } from '../predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { ITransaction } from '../transaction/ITransaction.js';
import { StateMask } from '../transaction/StateMask.js';
import { TokenId } from '../transaction/TokenId.js';
import { TokenType } from '../transaction/TokenType.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from '../transaction/verification/rule/InclusionProofVerificationRule.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Unicity-id mint transaction bundled with a verified inclusion proof.
 */
export class CertifiedUnicityIdMintTransaction implements ITransaction {
  private readonly _brand = 'CertifiedUnicityIdMintTransaction' as const;

  public constructor(
    private readonly transaction: UnicityIdMintTransaction,
    public readonly inclusionProof: InclusionProof,
  ) {}

  /**
   * @returns {Uint8Array} Data payload of the inner transaction.
   */
  public get data(): Uint8Array {
    return this.transaction.data;
  }

  /**
   * @returns {EncodedPredicate} Lock script of the inner transaction.
   */
  public get lockScript(): EncodedPredicate {
    return this.transaction.lockScript;
  }

  /**
   * @returns {NetworkId} Network identifier of the inner transaction.
   */
  public get networkId(): NetworkId {
    return this.transaction.networkId;
  }

  /**
   * @returns {EncodedPredicate} Recipient predicate of the inner transaction.
   */
  public get recipient(): EncodedPredicate {
    return this.transaction.recipient;
  }

  /**
   * @returns {DataHash} Source state hash of the inner transaction.
   */
  public get sourceStateHash(): DataHash {
    return this.transaction.sourceStateHash;
  }

  /**
   * @returns {StateMask} State mask of the inner transaction.
   */
  public get stateMask(): StateMask {
    return this.transaction.stateMask;
  }

  /**
   * @returns {SignaturePredicate} Target predicate of the inner transaction.
   */
  public get targetPredicate(): SignaturePredicate {
    return this.transaction.targetPredicate;
  }

  /**
   * @returns {TokenId} Token id of the inner transaction.
   */
  public get tokenId(): TokenId {
    return this.transaction.tokenId;
  }

  /**
   * @returns {TokenType} Token type of the inner transaction.
   */
  public get tokenType(): TokenType {
    return this.transaction.tokenType;
  }

  /**
   * @returns {UnicityId} Unicity id of the inner transaction.
   */
  public get unicityId(): UnicityId {
    return this.transaction.unicityId;
  }

  /**
   * Create CertifiedUnicityIdMintTransaction from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {Promise<CertifiedUnicityIdMintTransaction>} Decoded certified transaction.
   */
  public static async fromCBOR(bytes: Uint8Array): Promise<CertifiedUnicityIdMintTransaction> {
    const data = CborDeserializer.decodeArray(bytes, 2);
    return new CertifiedUnicityIdMintTransaction(
      await UnicityIdMintTransaction.fromCBOR(data[0]),
      InclusionProof.fromCBOR(data[1]),
    );
  }

  /**
   * Create CertifiedUnicityIdMintTransaction from unicity-id mint transaction and inclusion proof.
   *
   * @param {RootTrustBase} trustBase Root trust base.
   * @param {PredicateVerifierService} predicateVerifier Predicate verifier service.
   * @param {UnicityIdMintTransaction} transaction Transaction to certify.
   * @param {InclusionProof} inclusionProof Inclusion proof for the transaction.
   * @returns {Promise<CertifiedUnicityIdMintTransaction>} Verified certified transaction.
   * @throws {Error} If the inclusion proof does not verify.
   */
  public static async fromTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    transaction: UnicityIdMintTransaction,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedUnicityIdMintTransaction> {
    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      inclusionProof,
      transaction,
    );
    if (result.status !== InclusionProofVerificationStatus.OK) {
      throw new Error(`Inclusion proof verification failed: ${result.status.toString()}`);
    }

    return new CertifiedUnicityIdMintTransaction(transaction, inclusionProof);
  }

  /**
   * @inheritDoc
   */
  public calculateStateHash(): Promise<DataHash> {
    return this.transaction.calculateStateHash();
  }

  /**
   * @inheritDoc
   */
  public calculateTransactionHash(): Promise<DataHash> {
    return this.transaction.calculateTransactionHash();
  }

  /**
   * @inheritDoc
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.transaction.toCBOR(), this.inclusionProof.toCBOR());
  }

  /**
   * @returns {string} String representation of the certified transaction.
   */
  public toString(): string {
    return dedent`
      CertifiedUnicityIdMintTransaction
        ${this.transaction.toString()}
        ${this.inclusionProof.toString()}`;
  }
}
