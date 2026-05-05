import { CertifiedUnicityIdMintTransaction } from './CertifiedUnicityIdMintTransaction.js';
import { UnicityId } from './UnicityId.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
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

export class UnicityIdMintTransaction implements ITransaction {
  public static readonly CBOR_TAG = 39041n;
  private static readonly VERSION = 1n;

  private constructor(
    public readonly sourceStateHash: MintTransactionState,
    public readonly lockScript: EncodedPredicate,
    public readonly recipient: EncodedPredicate,
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    public readonly targetPredicate: SignaturePredicate,
    public readonly unicityId: UnicityId,
  ) {}

  public get data(): Uint8Array {
    return EncodedPredicate.fromPredicate(this.targetPredicate).toCBOR();
  }

  public get stateMask(): Uint8Array {
    return new Uint8Array(this.tokenId.bytes);
  }

  public get version(): bigint {
    return UnicityIdMintTransaction.VERSION;
  }

  public static async create(
    lockScript: SignaturePredicate,
    recipient: IPredicate,
    unicityId: UnicityId,
    tokenType: TokenType,
    targetPredicate: SignaturePredicate,
  ): Promise<UnicityIdMintTransaction> {
    const tokenId = await unicityId.toTokenId();

    return new UnicityIdMintTransaction(
      await MintTransactionState.create(tokenId),
      EncodedPredicate.fromPredicate(lockScript),
      EncodedPredicate.fromPredicate(recipient),
      tokenId,
      tokenType,
      targetPredicate,
      unicityId,
    );
  }

  public static fromCBOR(bytes: Uint8Array): Promise<UnicityIdMintTransaction> {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== UnicityIdMintTransaction.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for UnicityIdMintTransaction: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data, 6);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== UnicityIdMintTransaction.VERSION) {
      throw new CborError(`Unsupported UnicityIdMintTransaction version: ${version}`);
    }

    return UnicityIdMintTransaction.create(
      SignaturePredicate.fromPredicate(EncodedPredicate.fromCBOR(data[1])),
      EncodedPredicate.fromCBOR(data[2]),
      UnicityId.fromCBOR(data[3]),
      TokenType.fromCBOR(data[4]),
      SignaturePredicate.fromPredicate(EncodedPredicate.fromCBOR(data[5])),
    );
  }

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

  public calculateTransactionHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(this.toCBOR()).digest();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      UnicityIdMintTransaction.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        this.lockScript.toCBOR(),
        this.recipient.toCBOR(),
        this.unicityId.toCBOR(),
        this.tokenType.toCBOR(),
        EncodedPredicate.fromPredicate(this.targetPredicate).toCBOR(),
      ),
    );
  }

  public toCertifiedTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedUnicityIdMintTransaction> {
    return CertifiedUnicityIdMintTransaction.fromTransaction(trustBase, predicateVerifier, this, inclusionProof);
  }

  public toString(): string {
    return dedent`
      UnicityIdMintTransaction
        Version: ${this.version.toString()}
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
