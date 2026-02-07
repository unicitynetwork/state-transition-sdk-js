import { CertificationData } from './CertificationData.js';
import { CertificationRequest } from './CertificationRequest.js';
import { CertificationResponse } from './CertificationResponse.js';
import { IAggregatorClient } from './IAggregatorClient.js';
import { InclusionProofResponse } from './InclusionProofResponse.js';
import { JsonRpcHttpTransport } from './json-rpc/JsonRpcHttpTransport.js';
import { StateId } from './StateId.js';
import { HexConverter } from '../serialization/HexConverter.js';

/**
 * Client implementation for communicating with an aggregator via JSON-RPC.
 */
export class AggregatorClient implements IAggregatorClient {
  private readonly transport: JsonRpcHttpTransport;

  /**
   * Create a new client pointing to the given aggregator URL.
   *
   * @param url Base URL of the aggregator JSON-RPC endpoint
   * @param key API key for authenticating
   */
  public constructor(
    url: string,
    private readonly key: string | null = null,
  ) {
    this.transport = new JsonRpcHttpTransport(url);
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

  /**
   * @inheritDoc
   */
  public async getInclusionProof(stateId: StateId): Promise<InclusionProofResponse> {
    const data = { stateId: HexConverter.encode(stateId.data) };
    return InclusionProofResponse.fromCBOR(
      HexConverter.decode((await this.transport.request('get_inclusion_proof.v2', data)) as string),
    );
  }

  /**
   * @inheritDoc
   */
  public async submitCertificationRequest(
    certificationData: CertificationData,
    receipt: boolean = false,
  ): Promise<CertificationResponse> {
    const request = await CertificationRequest.create(certificationData, receipt);

    const response = await this.transport.request(
      'certification_request',
      HexConverter.encode(request.toCBOR()),
      this.key ? new Headers([['X-API-Key', this.key]]) : undefined,
    );

    return CertificationResponse.fromJSON(response);
  }
}
