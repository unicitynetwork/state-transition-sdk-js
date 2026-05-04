import { UnicityId } from './UnicityId.js';
import { UnicityIdMintTransaction } from './UnicityIdMintTransaction.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { SignaturePredicate } from '../predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { ITransaction } from '../transaction/ITransaction.js';
import { TokenId } from '../transaction/TokenId.js';
import { TokenType } from '../transaction/TokenType.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from '../transaction/verification/rule/InclusionProofVerificationRule.js';
import { dedent } from '../util/StringUtils.js';

export class CertifiedUnicityIdMintTransaction implements ITransaction {
  public constructor(
    private readonly transaction: UnicityIdMintTransaction,
    public readonly inclusionProof: InclusionProof,
  ) {}

  public get data(): Uint8Array {
    return this.transaction.data;
  }

  public get lockScript(): EncodedPredicate {
    return this.transaction.lockScript;
  }

  public get recipient(): EncodedPredicate {
    return this.transaction.recipient;
  }

  public get sourceStateHash(): DataHash {
    return this.transaction.sourceStateHash;
  }

  public get stateMask(): Uint8Array {
    return this.transaction.stateMask;
  }

  public get targetPredicate(): SignaturePredicate {
    return this.transaction.targetPredicate;
  }

  public get tokenId(): TokenId {
    return this.transaction.tokenId;
  }

  public get tokenType(): TokenType {
    return this.transaction.tokenType;
  }

  public get unicityId(): UnicityId {
    return this.transaction.unicityId;
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<CertifiedUnicityIdMintTransaction> {
    const data = CborDeserializer.decodeArray(bytes, 2);
    return new CertifiedUnicityIdMintTransaction(
      await UnicityIdMintTransaction.fromCBOR(data[0]),
      InclusionProof.fromCBOR(data[1]),
    );
  }

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

  public calculateStateHash(): Promise<DataHash> {
    return this.transaction.calculateStateHash();
  }

  public calculateTransactionHash(): Promise<DataHash> {
    return this.transaction.calculateTransactionHash();
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.transaction.toCBOR(), this.inclusionProof.toCBOR());
  }

  public toString(): string {
    return dedent`
      CertifiedUnicityIdMintTransaction
        ${this.transaction.toString()}
        ${this.inclusionProof.toString()}`;
  }
}
