import { Authenticator } from '@unicitylabs/commons/lib/api/Authenticator.js';
import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { SubmitCommitmentStatus } from '@unicitylabs/commons/lib/api/SubmitCommitmentResponse.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';

import { StateTransitionClient } from './StateTransitionClient.js';
import { Commitment } from './transaction/Commitment.js';
import { TransactionData } from './transaction/TransactionData.js';
import { OfflineCommitment } from "./transaction/OfflineCommitment.js";
import {waitInclusionProof} from "../tests/InclusionProofUtils.js";
import {Transaction} from "./transaction/Transaction.js";

/**
 * High level client implementing the token state transition workflow.
 */
export class StateTransitionOfflineClient extends StateTransitionClient {

  /**
   * Create an offline commitment for a transaction (does not post it to the aggregator).
   *
   * @param transactionData
   * @param signingService
   */
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
   * Submit an offline transaction commitment to the aggregator.
   *
   * @param requestId
   * @param transactionData
   * @param authenticator
   */
  public async submitOfflineTransaction({
    requestId,
    transactionData,
    authenticator,
  }: OfflineCommitment): Promise<Transaction<TransactionData>> {
    const result = await this.client.submitTransaction(requestId, transactionData.hash, authenticator, false);

    if (result.status !== SubmitCommitmentStatus.SUCCESS) {
      throw new Error(`Could not submit transaction: ${result.status}`);
    }

    const commitment = new Commitment(requestId, transactionData, authenticator);
    return await this.createTransaction(commitment, await waitInclusionProof(this, commitment));
  }
}
