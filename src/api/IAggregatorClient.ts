import { Authenticator } from './Authenticator.js';
import { RequestId } from './RequestId.js';
import { SubmitCommitmentResponse } from './SubmitCommitmentResponse.js';
import { DataHash } from '../hash/DataHash.js';
import { InclusionProof } from '../transaction/InclusionProof.js';

/**
 * Client interface for interacting with an aggregator service.
 */
export interface IAggregatorClient {
  /**
   * Submit a transaction commitment for inclusion in the ledger.
   *
   * @param requestId       Unique request identifier
   * @param transactionHash Hash of the transaction payload
   * @param authenticator   Authenticator proving request ownership
   * @param receipt         Require a signed receipt of the commitment
   * @returns Result status from the aggregator
   */
  submitTransaction(
    requestId: RequestId,
    transactionHash: DataHash,
    authenticator: Authenticator,
    receipt?: boolean,
  ): Promise<SubmitCommitmentResponse>;

  /**
   * Retrieve an inclusion proof for the given request.
   *
   * @param requestId Request identifier to query
   * @returns The inclusion proof returned by the aggregator
   */
  getInclusionProof(requestId: RequestId): Promise<InclusionProof>;
}
