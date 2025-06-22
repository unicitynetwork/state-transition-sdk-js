import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { SubmitCommitmentStatus } from '@unicitylabs/commons/lib/api/SubmitCommitmentResponse.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';

import { StateTransitionClient } from './StateTransitionClient.js';
import { Commitment } from './transaction/Commitment.js';
import { TransactionData } from './transaction/TransactionData.js';

/**
 * Result returned when submitting a transaction to the aggregator.
 */
class OfflineCommitment {
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

/**
 * High level client implementing the token state transition workflow.
 */
export class StateTransitionOfflineClient extends StateTransitionClient {
  public async createOfflineCommitment(
    transactionData: TransactionData,
    signingService: SigningService,
  ): Promise<OfflineCommitment> {
    if (!(await transactionData.sourceState.unlockPredicate.isOwner(signingService.publicKey))) {
      throw new Error('Failed to unlock token');
    }

    const requestId = await RequestId.create(signingService.publicKey, transactionData.sourceState.hash);

    const authenticator = await Authenticator.create(
      signingService,
      transactionData.hash,
      transactionData.sourceState.hash,
    );

    return new OfflineCommitment(requestId, transactionData, authenticator);
  }

  /**
   *
   * @param requestId
   * @param transactionData
   * @param authenticator
   */
  public async submitOfflineCommitment({
    requestId,
    transactionData,
    authenticator,
  }: OfflineCommitment): Promise<Commitment<TransactionData>> {
    const result = await this.client.submitTransaction(requestId, transactionData.hash, authenticator);

    if (result.status !== SubmitCommitmentStatus.SUCCESS) {
      throw new Error(`Could not submit transaction: ${result.status}`);
    }

    return new Commitment(requestId, transactionData, authenticator);
  }
}
