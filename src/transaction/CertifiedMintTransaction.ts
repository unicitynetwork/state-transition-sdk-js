import { ITransaction } from './ITransaction.js';
import { MintTransaction } from './MintTransaction.js';
import { PayToScriptHash } from './Recipient.js';
import { TokenId } from './TokenId.js';
import { TokenType } from './TokenType.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { dedent } from '../util/StringUtils.js';

export class CertifiedMintTransaction implements ITransaction {
  public constructor(
    private readonly transaction: MintTransaction,
    public readonly inclusionProof: InclusionProof,
  ) {}

  public get data(): Uint8Array {
    return this.transaction.data;
  }

  // TODO: Maybe get this from inclusion proof since it should be the same as in mint transaction.
  public get lockScript(): IPredicate {
    return this.transaction.lockScript;
  }

  public get recipient(): PayToScriptHash {
    return this.transaction.recipient;
  }

  public get tokenId(): TokenId {
    return this.transaction.tokenId;
  }

  public get tokenType(): TokenType {
    return this.transaction.tokenType;
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
      CertifiedMintTransaction
        ${this.transaction.toString()}
        Inclusion Proof: ${this.inclusionProof.toString()}`;
  }
}
