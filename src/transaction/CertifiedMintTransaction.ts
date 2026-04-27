import { ITransaction } from './ITransaction.js';
import { MintTransaction } from './MintTransaction.js';
import { TokenId } from './TokenId.js';
import { TokenType } from './TokenType.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { dedent } from '../util/StringUtils.js';
import { VerificationError } from '../verification/VerificationError.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from './verification/rule/InclusionProofVerificationRule.js';

export class CertifiedMintTransaction implements ITransaction {
  private constructor(
    private readonly transaction: MintTransaction,
    public readonly inclusionProof: InclusionProof,
  ) {}

  public get data(): Uint8Array | null {
    return this.transaction.data;
  }

  public get justification(): Uint8Array | null {
    return this.transaction.justification;
  }

  public get lockScript(): IPredicate {
    return this.transaction.lockScript;
  }

  public get nonce(): Uint8Array {
    return this.transaction.nonce;
  }

  public get recipient(): IPredicate {
    return this.transaction.recipient;
  }

  public get sourceStateHash(): DataHash {
    return this.transaction.sourceStateHash;
  }

  public get tokenId(): TokenId {
    return this.transaction.tokenId;
  }

  public get tokenType(): TokenType {
    return this.transaction.tokenType;
  }

  public static async fromCBOR(bytes: Uint8Array): Promise<CertifiedMintTransaction> {
    const data = CborDeserializer.decodeArray(bytes);
    return new CertifiedMintTransaction(await MintTransaction.fromCBOR(data[0]), InclusionProof.fromCBOR(data[1]));
  }

  public static async fromTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    transaction: MintTransaction,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedMintTransaction> {
    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      inclusionProof,
      transaction,
    );
    if (result.status !== InclusionProofVerificationStatus.OK) {
      throw new VerificationError('Inclusion proof verification failed', result);
    }

    return new CertifiedMintTransaction(transaction, inclusionProof);
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
      CertifiedMintTransaction
        ${this.transaction.toString()}
        ${this.inclusionProof.toString()}`;
  }
}
