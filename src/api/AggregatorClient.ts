import { Authenticator } from './Authenticator.js';
import { IAggregatorClient } from './IAggregatorClient.js';
import { JsonRpcHttpTransport } from './json-rpc/JsonRpcHttpTransport.js';
import { RequestId } from './RequestId.js';
import { SubmitCommitmentRequest } from './SubmitCommitmentRequest.js';
import { SubmitCommitmentResponse } from './SubmitCommitmentResponse.js';
import { DataHash } from '../hash/DataHash.js';
import { InclusionProofResponse } from './InclusionProofResponse.js';

/**
 * Client implementation for communicating with an aggregator via JSON-RPC.
 */
export class AggregatorClient implements IAggregatorClient {
  private readonly transport: JsonRpcHttpTransport;

  /**
   * Create a new client pointing to the given aggregator URL.
   *
   * @param url Base URL of the aggregator JSON-RPC endpoint
   */
  public constructor(url: string) {
    this.transport = new JsonRpcHttpTransport(url);
  }

  /**
   * @inheritDoc
   */
  public async submitCommitment(
    requestId: RequestId,
    transactionHash: DataHash,
    authenticator: Authenticator,
    receipt: boolean = false,
  ): Promise<SubmitCommitmentResponse> {
    const request = new SubmitCommitmentRequest(requestId, transactionHash, authenticator, receipt);

    const response = await this.transport.request('submit_commitment', request.toJSON());

    return SubmitCommitmentResponse.fromJSON(response);
  }

  /**
   * @inheritDoc
   */
  public async getInclusionProof(requestId: RequestId): Promise<InclusionProofResponse> {
    const data = { requestId: requestId.toJSON() };
    return InclusionProofResponse.fromJSON(await this.transport.request('get_inclusion_proof', data));
  }

  public async getBlockHeight(): Promise<bigint> {
    const response = await this.transport.request('get_block_height', {});
    if (
      response &&
      typeof response === 'object' &&
      'blockNumber' in response &&
      (typeof response.blockNumber === 'string' ||
        typeof response.blockNumber === 'number' ||
        typeof response.blockNumber === 'bigint')
    ) {
      return BigInt(response.blockNumber);
    }
    throw new Error('Invalid response format for block height');
  }
}
