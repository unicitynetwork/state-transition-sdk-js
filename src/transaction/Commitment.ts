import { InclusionProof } from './InclusionProof.js';
import { MintTransactionData } from './MintTransactionData.js';
import { Transaction } from './Transaction.js';
import { TransferTransactionData } from './TransferTransactionData.js';
import { Authenticator } from '../api/Authenticator.js';
import { RequestId } from '../api/RequestId.js';

/**
 * Represents a commitment to a transaction, including its request ID, transaction data,
 * and an authenticator signature.
 *
 * @template T - The type of transaction data, which can be either `TransactionData`
 *               or `MintTransactionData` with an optional `ISerializable` payload.
 */
export abstract class Commitment<T extends TransferTransactionData | MintTransactionData> {
  /**
   * Creates a new `Commitment` instance.
   *
   * @param {RequestId} requestId - The unique identifier for the transaction request.
   * @param {T} transactionData - The data associated with the transaction.
   * @param {Authenticator} authenticator - The signature over the transaction payload.
   */
  protected constructor(
    public readonly requestId: RequestId,
    public readonly transactionData: T,
    public readonly authenticator: Authenticator,
  ) {}

  /**
   * Convert commitment to transaction.
   *
   * @param {InclusionProof} inclusionProof Commitment inclusion proof
   * @return transaction
   */
  public abstract toTransaction(inclusionProof: InclusionProof): Transaction<T>;
}
