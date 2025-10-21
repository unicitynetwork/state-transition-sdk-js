import { IMintTransactionReason } from './IMintTransactionReason.js';
import { InclusionProof } from './InclusionProof.js';
import { MintTransactionData } from './MintTransactionData.js';
import { TransferTransactionData } from './TransferTransactionData.js';
import { DataHasher } from '../hash/DataHasher.js';
import { dedent } from '../util/StringUtils.js';

/**
 * A transaction along with its verified inclusion proof.
 */
export abstract class Transaction<T extends TransferTransactionData | MintTransactionData<IMintTransactionReason>> {
  /**
   * @param data           Transaction data payload
   * @param inclusionProof Proof of inclusion in the ledger
   */
  protected constructor(
    public readonly data: T,
    public readonly inclusionProof: InclusionProof,
  ) {}

  /**
   * Verify if the provided data matches the optional data hash.
   * @param data Data to verify against the transaction's data hash
   */
  public async containsRecipientData(data: Uint8Array | null): Promise<boolean> {
    if (this.data.recipientDataHash) {
      if (!data) {
        return false;
      }

      const dataHash = await new DataHasher(this.data.recipientDataHash.algorithm).update(data).digest();

      return dataHash.equals(this.data.recipientDataHash);
    }

    return !data;
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
        Transaction:
          ${this.data.toString()}
          ${this.inclusionProof.toString()}`;
  }

  public abstract toJSON(): unknown;

  public abstract toCBOR(): Uint8Array;
}
