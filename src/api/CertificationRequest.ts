import { CertificationData, ICertificationDataJson } from './CertificationData.js';
import { StateId } from './StateId.js';

/**
 * JSON representation of a certification request.
 */
export interface ICertificationRequestJson {
  /** The state ID as a string. */
  readonly stateId: string;
  /** The certification data json. */
  readonly certificationData: ICertificationDataJson;
  /** Optional flag to request a receipt. */
  readonly receipt?: boolean;
}

/**
 * Certification request object sent by the client to the aggregator.
 */
export class CertificationRequest {
  /**
   * Constructs a CertificationRequest instance.
   * @param {StateId} stateId Unique state identifier.
   * @param {CertificationData} certificationData Certification data.
   * @param {boolean} receipt Optional flag to request a receipt.
   */
  private constructor(
    public readonly stateId: StateId,
    public readonly certificationData: CertificationData,
    public readonly receipt?: boolean,
  ) {}

  /**
   * Create a new CertificationRequest instance.
   * @param {CertificationData} certificationData Certification data.
   * @param {boolean} receipt Optional flag to request a receipt.
   *
   * @returns {Promise<CertificationRequest>} A promise that resolves to a CertificationRequest instance.
   */
  public static async create(certificationData: CertificationData, receipt?: boolean): Promise<CertificationRequest> {
    return new CertificationRequest(await certificationData.calculateStateId(), certificationData, receipt);
  }

  /**
   * Convert the request to a JSON object.
   *
   * @returns JSON object
   */
  public toJSON(): ICertificationRequestJson {
    return {
      certificationData: this.certificationData.toJSON(),
      receipt: this.receipt,
      stateId: this.stateId.toJSON(),
    };
  }
}
