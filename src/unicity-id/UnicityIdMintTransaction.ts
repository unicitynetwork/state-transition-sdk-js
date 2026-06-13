import { CertifiedUnicityIdMintTransaction } from './CertifiedUnicityIdMintTransaction.js';
import { UnicityId } from './UnicityId.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { NetworkId } from '../api/NetworkId.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { SignaturePredicate } from '../predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { ITransaction } from '../transaction/ITransaction.js';
import { MintTransactionState } from '../transaction/MintTransactionState.js';
import { TokenId } from '../transaction/TokenId.js';
import { TokenType } from '../transaction/TokenType.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Mint transaction for a unicity-id token.
 */
export class UnicityIdMintTransaction implements ITransaction {
  public static readonly CBOR_TAG = 39041n;
  private static readonly VERSION = 1n;

  private readonly _brand = 'UnicityIdMintTransaction' as const;

  private constructor(
    public readonly sourceStateHash: MintTransactionState,
    public readonly lockScript: EncodedPredicate,
    public readonly networkId: NetworkId,
    public readonly recipient: EncodedPredicate,
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    public readonly targetPredicate: SignaturePredicate,
    public readonly unicityId: UnicityId,
  ) {}

  /**
   * @returns {Uint8Array} CBOR-encoded target predicate.
   */
  public get data(): Uint8Array {
    return EncodedPredicate.fromPredicate(this.targetPredicate).toCBOR();
  }

  /**
   * @returns {Uint8Array} State mask used when computing the resulting state hash.
   */
  public get stateMask(): Uint8Array {
    return new Uint8Array(this.tokenId.bytes);
  }

  /**
   * @returns {bigint} Wire-format version of this transaction.
   */
  public get version(): bigint {
    return UnicityIdMintTransaction.VERSION;
  }

  /**
   * Create a UnicityIdMintTransaction.
   *
   * @param {NetworkId} networkId Network identifier.
   * @param {SignaturePredicate} lockScript Issuer lock script.
   * @param {IPredicate} recipient Predicate that will lock the minted state.
   * @param {UnicityId} unicityId Unicity id being minted.
   * @param {TokenType} tokenType Token type.
   * @param {SignaturePredicate} targetPredicate Predicate the unicity id resolves to.
   * @returns {Promise<UnicityIdMintTransaction>} New mint transaction.
   */
  public static async create(
    networkId: NetworkId,
    lockScript: SignaturePredicate,
    recipient: IPredicate,
    unicityId: UnicityId,
    tokenType: TokenType,
    targetPredicate: SignaturePredicate,
  ): Promise<UnicityIdMintTransaction> {
    const tokenId = await TokenId.fromSalt(networkId, await unicityId.toTokenSalt());

    return new UnicityIdMintTransaction(
      await MintTransactionState.create(tokenId),
      EncodedPredicate.fromPredicate(lockScript),
      networkId,
      EncodedPredicate.fromPredicate(recipient),
      tokenId,
      tokenType,
      targetPredicate,
      unicityId,
    );
  }

  /**
   * Create UnicityIdMintTransaction from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {Promise<UnicityIdMintTransaction>} Decoded transaction.
   * @throws {CborError} On wrong tag or unsupported version.
   */
  public static fromCBOR(bytes: Uint8Array): Promise<UnicityIdMintTransaction> {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== UnicityIdMintTransaction.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for UnicityIdMintTransaction: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data, 7);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== UnicityIdMintTransaction.VERSION) {
      throw new CborError(`Unsupported UnicityIdMintTransaction version: ${version}`);
    }

    return UnicityIdMintTransaction.create(
      NetworkId.fromId(CborDeserializer.decodeUnsignedInteger(data[1])),
      SignaturePredicate.fromPredicate(EncodedPredicate.fromCBOR(data[2])),
      EncodedPredicate.fromCBOR(data[3]),
      UnicityId.fromCBOR(data[4]),
      TokenType.fromCBOR(data[5]),
      SignaturePredicate.fromPredicate(EncodedPredicate.fromCBOR(data[6])),
    );
  }

  /**
   * @inheritDoc
   */
  public calculateStateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(this.sourceStateHash.imprint),
          CborSerializer.encodeByteString(this.stateMask),
        ),
      )
      .digest();
  }

  /**
   * @inheritDoc
   */
  public calculateTransactionHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(this.toCBOR()).digest();
  }

  /**
   * @inheritDoc
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      UnicityIdMintTransaction.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        CborSerializer.encodeUnsignedInteger(this.networkId.id),
        this.lockScript.toCBOR(),
        this.recipient.toCBOR(),
        this.unicityId.toCBOR(),
        this.tokenType.toCBOR(),
        EncodedPredicate.fromPredicate(this.targetPredicate).toCBOR(),
      ),
    );
  }

  /**
   * Bundle this transaction with its inclusion proof.
   *
   * @param {RootTrustBase} trustBase Root trust base used to verify the inclusion certificate.
   * @param {PredicateVerifierService} predicateVerifier Verifier for embedded predicates.
   * @param {InclusionProof} inclusionProof Inclusion proof for this transaction.
   * @returns {Promise<CertifiedUnicityIdMintTransaction>} Verified certified transaction.
   */
  public toCertifiedTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedUnicityIdMintTransaction> {
    return CertifiedUnicityIdMintTransaction.fromTransaction(trustBase, predicateVerifier, this, inclusionProof);
  }

  /**
   * @returns {string} String representation of the transaction.
   */
  public toString(): string {
    return dedent`
      UnicityIdMintTransaction
        Version: ${this.version.toString()}
        Network ID: ${this.networkId.toString()}
        Lock Script:
          ${this.lockScript.toString()}
        Recipient: ${this.recipient.toString()}
        Token ID: ${this.tokenId.toString()}
        Token Type: ${this.tokenType.toString()}
        Unicity ID:
          ${this.unicityId.toString()}
        Target Predicate:
          ${this.targetPredicate.toString()}`;
  }
}
