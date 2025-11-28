import { StateId } from '../../api/StateId.js';
import { RootTrustBase } from '../../bft/RootTrustBase.js';
import { DataHash } from '../../hash/DataHash.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { Token } from '../../token/Token.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenType } from '../../token/TokenType.js';
import { InclusionProofVerificationStatus } from '../../transaction/InclusionProof.js';
import { TransferTransaction } from '../../transaction/TransferTransaction.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { areUint8ArraysEqual } from '../../util/TypedArrayUtils.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngineType } from '../PredicateEngineType.js';
import { EmbeddedPredicateType } from './EmbeddedPredicateType.js';
import { DataHasher } from '../../hash/DataHasher.js';
import { IPredicateReference } from '../IPredicateReference.js';

/**
 * Base predicate containing common verification logic for key-based predicates.
 */
export abstract class DefaultPredicate implements IPredicate {
  /**
   * @param type          Predicate type value
   * @param tokenId
   * @param tokenType
   * @param _publicKey    Public key able to sign transactions
   * @param signingAlgorithm     Signing algorithm name
   * @param hashAlgorithm Hash algorithm used for hashing operations
   * @param _nonce        Nonce providing uniqueness
   */
  protected constructor(
    public readonly type: EmbeddedPredicateType.MASKED | EmbeddedPredicateType.UNMASKED,
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    private readonly _publicKey: Uint8Array,
    public readonly signingAlgorithm: string,
    public readonly hashAlgorithm: HashAlgorithm,
    private readonly _nonce: Uint8Array,
  ) {
    this._publicKey = new Uint8Array(_publicKey);
    this._nonce = new Uint8Array(_nonce);
  }

  /** Public key associated with the predicate. */
  public get publicKey(): Uint8Array {
    return this._publicKey;
  }

  /**
   * @inheritDoc
   */
  public get nonce(): Uint8Array {
    return this._nonce;
  }

  public get engine(): PredicateEngineType {
    return PredicateEngineType.EMBEDDED;
  }

  /**
   * @inheritDoc
   */
  public async calculateHash(): Promise<DataHash> {
    const reference = await this.getReference();
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          reference.hash.toCBOR(),
          this.tokenId.toCBOR(),
          CborSerializer.encodeByteString(this._nonce),
        ),
      )
      .digest();
  }

  public encode(): Uint8Array {
    return new Uint8Array([this.type]);
  }

  public encodeParameters(): Uint8Array {
    return CborSerializer.encodeArray(
      this.tokenId.toCBOR(),
      this.tokenType.toCBOR(),
      CborSerializer.encodeByteString(this.publicKey),
      CborSerializer.encodeTextString(this.signingAlgorithm),
      CborSerializer.encodeUnsignedInteger(this.hashAlgorithm),
      CborSerializer.encodeByteString(this.nonce),
    );
  }

  /**
   * @inheritDoc
   */
  public async verify(trustBase: RootTrustBase, token: Token, transaction: TransferTransaction): Promise<boolean> {
    if (!this.tokenId.equals(token.id) || !this.tokenType.equals(token.type)) {
      return false;
    }

    const certificationData = transaction.inclusionProof.certificationData;
    if (certificationData == null) {
      return false;
    }

    if (!areUint8ArraysEqual(certificationData.publicKey, this.publicKey)) {
      return false;
    }

    const transactionHash = await transaction.data.calculateHash();
    if (!certificationData.transactionHash.equals(transactionHash)) {
      return false;
    }

    if (!(await certificationData.verify())) {
      return false;
    }

    const stateId = await StateId.create(this.publicKey, await transaction.data.sourceState.calculateHash());

    const status = await transaction.inclusionProof.verify(trustBase, stateId);
    return status == InclusionProofVerificationStatus.OK;
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
          Predicate[${this.type}]:
            PublicKey: ${HexConverter.encode(this.publicKey)}
            Algorithm: ${this.signingAlgorithm}
            Hash Algorithm: ${HashAlgorithm[this.hashAlgorithm]}
            Nonce: ${HexConverter.encode(this.nonce)}`;
  }

  /**
   * @inheritDoc
   */
  public isOwner(publicKey: Uint8Array): Promise<boolean> {
    return Promise.resolve(HexConverter.encode(publicKey) === HexConverter.encode(this.publicKey));
  }

  /**
   * @inheritDoc
   */
  public abstract getReference(): Promise<IPredicateReference>;
}
