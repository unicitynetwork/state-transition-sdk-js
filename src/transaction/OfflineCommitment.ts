import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';

import { TransactionData } from './TransactionData.js';

/**
 * Result returned when submitting a transaction to the aggregator.
 */
export class OfflineCommitment {
  private readonly _brand: string = 'OfflineCommitment';

  /**
   * @param requestId       Request identifier used for submission
   * @param transactionData Submitted transaction data
   * @param authenticator   Signature over the payload
   */
  public constructor(
    public readonly requestId: RequestId,
    public readonly transactionData: TransactionData,
    public readonly authenticator: Authenticator,
  ) {}
}
