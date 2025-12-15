import { CertifiedMintTransaction } from './CertifiedMintTransaction.js';
import { ITransaction } from './ITransaction.js';
import { MintTransactionState } from './MintTransactionState.js';
import { PayToScriptHash } from './Recipient.js';
import { TokenId } from './TokenId.js';
import { TokenType } from './TokenType.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from './verification/rule/InclusionProofVerificationRule.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { StateId } from '../api/StateId.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { MintSigningService } from '../crypto/MintSigningService.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PayToPublicKeyPredicate } from '../predicate/PayToPublicKeyPredicate.js';
import { PredicateVerifierFactory } from '../predicate/verification/PredicateVerifierFactory.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

export class MintTransaction implements ITransaction {
  private constructor(
    public readonly lockScript: IPredicate,
    public readonly recipient: PayToScriptHash,
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    private readonly _data: Uint8Array,
  ) {}

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public get x(): Uint8Array {
    return new Uint8Array(this.tokenId.bytes);
  }

  public static async create(
    recipient: PayToScriptHash,
    tokenId: TokenId,
    tokenType: TokenType,
    data: Uint8Array,
  ): Promise<MintTransaction> {
    data = new Uint8Array(data);

    const signingService = await MintSigningService.create(tokenId);
    return new MintTransaction(PayToPublicKeyPredicate.create(signingService), recipient, tokenId, tokenType, data);
  }

  public static fromCBOR(bytes: Uint8Array): Promise<MintTransaction> {
    const data = CborDeserializer.decodeArray(bytes);
    const aux = CborDeserializer.decodeArray(data[2]);

    return MintTransaction.create(
      PayToScriptHash.fromCBOR(data[0]),
      TokenId.fromCBOR(data[1]),
      TokenType.fromCBOR(aux[0]),
      CborDeserializer.decodeByteString(aux[1]),
    );
  }

  public calculateSourceStateHash(): Promise<DataHash> {
    return MintTransactionState.create(this.tokenId);
  }

  public calculateTransactionHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          this.recipient.toCBOR(),
          this.tokenId.toCBOR(),
          CborSerializer.encodeArray(this.tokenType.toCBOR(), CborSerializer.encodeByteString(this._data)),
        ),
      )
      .digest();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.recipient.toCBOR(),
      this.tokenId.toCBOR(),
      CborSerializer.encodeArray(this.tokenType.toCBOR(), CborSerializer.encodeByteString(this._data)),
    );
  }

  public async toCertifiedTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierFactory,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedMintTransaction> {
    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      inclusionProof,
      await StateId.fromTransaction(this),
    );
    if (result.status !== InclusionProofVerificationStatus.OK) {
      throw new Error(`Inclusion proof verification failed: ${result.status.toString()}`);
    }

    return new CertifiedMintTransaction(this, inclusionProof);
  }

  public toString(): string {
    return dedent`
      MintTransaction
        Lock Script: 
          ${this.lockScript.toString()}
        Recipient: ${this.recipient.toString()}
        Token ID: ${this.tokenId.toString()}
        Token Type: ${this.tokenType.toString()}
        Data: ${HexConverter.encode(this._data)}`;
  }
}
