import { CertificationData } from './api/CertificationData.js';
import { CertificationResponse } from './api/CertificationResponse.js';
import { IAggregatorClient } from './api/IAggregatorClient.js';
import { InclusionProofResponse } from './api/InclusionProofResponse.js';
import { StateId } from './api/StateId.js';

export class StateTransitionClient {
  public constructor(private readonly client: IAggregatorClient) {}

  /**
   * Retrieves the inclusion proof for a given transaction.
   *
   * @param {StateId} stateId The state ID of inclusion proof to retrieve.
   * @return inclusion proof response from the aggregator.
   */
  public getInclusionProof(stateId: StateId): Promise<InclusionProofResponse> {
    return this.client.getInclusionProof(stateId);
  }

  public submitCertificationRequest(certificationData: CertificationData): Promise<CertificationResponse> {
    return this.client.submitCertificationRequest(certificationData);
  }
}
