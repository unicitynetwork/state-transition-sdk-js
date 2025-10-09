import { ISerializable } from '../ISerializable.js';
import { MintTransactionData } from './MintTransactionData.js';
import { TransactionData } from './TransactionData.js';
import { Authenticator } from '../api/Authenticator.js';
import { RequestId } from '../api/RequestId.js';
import { SigningService } from '../sign/SigningService.js';

/**
 * Represents a commitment to a transaction, including its request ID, transaction data,
 * and an authenticator signature.
 *
 * @template T - The type of transaction data, which can be either `TransactionData`
 *               or `MintTransactionData` with an optional `ISerializable` payload.
 */
export class Commitment<T extends TransactionData | MintTransactionData<ISerializable | null>> {
  /**
   * Creates a new `Commitment` instance.
   *
   * @param {RequestId} requestId - The unique identifier for the transaction request.
   * @param {T} transactionData - The data associated with the transaction.
   * @param {Authenticator} authenticator - The signature over the transaction payload.
   */
  public constructor(
    public readonly requestId: RequestId,
    public readonly transactionData: T,
    public readonly authenticator: Authenticator,
  ) {}

  /**
   * Creates a new `Commitment` instance by generating a request ID and authenticator.
   *
   * @template T - The type of transaction data.
   * @param {T} transactionData - The data associated with the transaction.
   * @param {SigningService} signingService - The service used to sign the transaction.
   * @returns {Promise<Commitment<T>>} A promise that resolves to a new `Commitment` instance.
   */
  public static async create<T extends TransactionData | MintTransactionData<ISerializable | null>>(
    transactionData: T,
    signingService: SigningService,
  ): Promise<Commitment<T>> {
    const requestId = await RequestId.create(signingService.publicKey, transactionData.sourceState.hash);
    const authenticator = await Authenticator.create(
      signingService,
      transactionData.hash,
      transactionData.sourceState.hash,
    );
    return new Commitment(requestId, transactionData, authenticator);
  }
}
