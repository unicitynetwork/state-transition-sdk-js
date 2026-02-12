import { ITransaction } from './ITransaction.js';
import { PayToScriptHash } from './PayToScriptHash.js';
import { TransferTransaction } from './TransferTransaction.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { dedent } from '../util/StringUtils.js';

export class CertifiedTransferTransaction implements ITransaction {
  public constructor(
    private readonly transaction: TransferTransaction,
    public readonly inclusionProof: InclusionProof,
  ) {}

  public get data(): Uint8Array {
    return this.transaction.data;
  }

  public get lockScript(): IPredicate {
    return this.transaction.lockScript;
  }

  public get recipient(): PayToScriptHash {
    return this.transaction.recipient;
  }

  public get sourceStateHash(): DataHash {
    return this.transaction.sourceStateHash;
  }

  public get x(): Uint8Array {
    return this.transaction.x;
  }

  public static fromCBOR(bytes: Uint8Array): CertifiedTransferTransaction {
    const data = CborDeserializer.decodeArray(bytes);
    return new CertifiedTransferTransaction(TransferTransaction.fromCBOR(data[0]), InclusionProof.fromCBOR(data[1]));
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
