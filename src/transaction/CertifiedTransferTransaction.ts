import { ITransaction } from './ITransaction.js';
import { Token } from './Token.js';
import { TransferTransaction } from './TransferTransaction.js';
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

export class CertifiedTransferTransaction implements ITransaction {
  private constructor(
    private readonly transaction: TransferTransaction,
    public readonly inclusionProof: InclusionProof,
  ) {}

  public get data(): Uint8Array | null {
    return this.transaction.data;
  }

  public get lockScript(): IPredicate {
    return this.transaction.lockScript;
  }

  public get recipient(): IPredicate {
    return this.transaction.recipient;
  }

  public get sourceStateHash(): DataHash {
    return this.transaction.sourceStateHash;
  }

  public get stateMask(): Uint8Array {
    return this.transaction.stateMask;
  }

  public static async fromCBOR(bytes: Uint8Array, token: Token): Promise<CertifiedTransferTransaction> {
    const data = CborDeserializer.decodeArray(bytes);
    return new CertifiedTransferTransaction(
      await TransferTransaction.fromCBOR(data[0], token),
      InclusionProof.fromCBOR(data[1]),
    );
  }

  public static async fromTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    transaction: TransferTransaction,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedTransferTransaction> {
    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      inclusionProof,
      transaction,
    );
    if (result.status !== InclusionProofVerificationStatus.OK) {
      throw new VerificationError('Inclusion proof verification failed', result);
    }

    return new CertifiedTransferTransaction(transaction, inclusionProof);
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
      CertifiedTransferTransaction
        ${this.transaction.toString()}
        ${this.inclusionProof.toString()}`;
  }
}
