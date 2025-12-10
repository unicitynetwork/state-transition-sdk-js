import { ITransaction } from './ITransaction.js';
import { PayToScriptHash } from './Recipient.js';
import { TransferTransaction } from './TransferTransaction.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { IPredicate } from '../predicate/IPredicate.js';
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

  public get x(): Uint8Array {
    return this.transaction.x;
  }

  public calculateSourceStateHash(): Promise<DataHash> {
    return this.transaction.calculateSourceStateHash();
  }

  public calculateTransactionHash(): Promise<DataHash> {
    return this.transaction.calculateTransactionHash();
  }

  public toString(): string {
    return dedent`
      CertifiedTransferTransaction
        ${this.transaction.toString()}
        Inclusion Proof: ${this.inclusionProof.toString()}`;
  }
}
