import { CertifiedUnicityIdMintTransaction } from './CertifiedUnicityIdMintTransaction.js';
import { UnicityId } from './UnicityId.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { SigningService } from '../crypto/secp256k1/SigningService.js';
import { PayToPublicKeyPredicate } from '../predicate/builtin/PayToPublicKeyPredicate.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { Address } from '../transaction/Address.js';
import { ITransaction } from '../transaction/ITransaction.js';
import { MintTransactionState } from '../transaction/MintTransactionState.js';
import { TokenId } from '../transaction/TokenId.js';
import { TokenType } from '../transaction/TokenType.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from '../transaction/verification/rule/InclusionProofVerificationRule.js';
import { dedent } from '../util/StringUtils.js';

export class UnicityIdMintTransaction implements ITransaction {
  private constructor(
    public readonly sourceStateHash: MintTransactionState,
    public readonly lockScript: IPredicate,
    public readonly recipient: Address,
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    public readonly targetPredicate: PayToPublicKeyPredicate,
    public readonly unicityId: UnicityId,
  ) {}

  public get data(): Uint8Array {
    return EncodedPredicate.fromPredicate(this.targetPredicate).toCBOR();
  }

  public get x(): Uint8Array {
    return new Uint8Array(this.tokenId.bytes);
  }

  public static async create(
    signingService: SigningService,
    recipient: Address,
    unicityId: UnicityId,
    tokenType: TokenType,
    targetPredicate: PayToPublicKeyPredicate,
  ): Promise<UnicityIdMintTransaction> {
    const tokenId = await unicityId.toTokenId();

    return new UnicityIdMintTransaction(
      await MintTransactionState.create(tokenId),
      PayToPublicKeyPredicate.fromSigningService(signingService),
      recipient,
      tokenId,
      tokenType,
      targetPredicate,
      unicityId,
    );
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<UnicityIdMintTransaction> {
    const data = CborDeserializer.decodeArray(bytes);
    const aux = CborDeserializer.decodeArray(data[3]);

    const unicityId = UnicityId.fromCBOR(data[2]);
    const tokenId = await unicityId.toTokenId();

    return new UnicityIdMintTransaction(
      await MintTransactionState.create(tokenId),
      EncodedPredicate.fromCBOR(data[0]),
      Address.fromCBOR(data[1]),
      tokenId,
      TokenType.fromCBOR(aux[0]),
      PayToPublicKeyPredicate.fromPredicate(EncodedPredicate.fromCBOR(aux[1])),
      unicityId,
    );
  }

  public calculateStateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(this.sourceStateHash.imprint),
          CborSerializer.encodeByteString(this.x),
        ),
      )
      .digest();
  }

  public calculateTransactionHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          this.recipient.toCBOR(),
          this.tokenId.toCBOR(),
          CborSerializer.encodeArray(
            this.tokenType.toCBOR(),
            EncodedPredicate.fromPredicate(this.targetPredicate).toCBOR(),
          ),
        ),
      )
      .digest();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      EncodedPredicate.fromPredicate(this.lockScript).toCBOR(),
      this.recipient.toCBOR(),
      this.unicityId.toCBOR(),
      CborSerializer.encodeArray(
        this.tokenType.toCBOR(),
        EncodedPredicate.fromPredicate(this.targetPredicate).toCBOR(),
      ),
    );
  }

  public async toCertifiedTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedUnicityIdMintTransaction> {
    const result = await InclusionProofVerificationRule.verify(trustBase, predicateVerifier, inclusionProof, this);
    if (result.status !== InclusionProofVerificationStatus.OK) {
      throw new Error(`Inclusion proof verification failed: ${result.status.toString()}`);
    }

    return new CertifiedUnicityIdMintTransaction(this, inclusionProof);
  }

  public toString(): string {
    return dedent`
      UnicityIdMintTransaction
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
