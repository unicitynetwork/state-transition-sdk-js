import { CertificationData } from './CertificationData.js';
import { CertificationResponse } from './CertificationResponse.js';
import { InclusionProofResponse } from './InclusionProofResponse.js';
import { StateId } from './StateId.js';

/**
 * Client interface for interacting with an aggregator service.
 */
export interface IAggregatorClient {
  /**
   * Retrieve an inclusion proof for the given request.
   *
   * @param stateId State identifier to query
   * @returns The inclusion proof returned by the aggregator
   */
  getInclusionProof(stateId: StateId): Promise<InclusionProofResponse>;

  /**
   * Submit a transaction commitment for inclusion in the ledger.
   *
   * @param {CertificationData} certificationData  The certification data to submit
   * @returns Result status from the aggregator
   */
  submitCertificationRequest(certificationData: CertificationData): Promise<CertificationResponse>;
}
