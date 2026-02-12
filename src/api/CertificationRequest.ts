import { CertificationData } from './CertificationData.js';
import { StateId } from './StateId.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

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
    public readonly receipt: boolean = false,
  ) {}

  /**
   * Create a new CertificationRequest instance.
   * @param {CertificationData} certificationData Certification data.
   * @param {boolean} receipt Optional flag to request a receipt.
   *
   * @returns {Promise<CertificationRequest>} A promise that resolves to a CertificationRequest instance.
   */
  public static async create(certificationData: CertificationData, receipt?: boolean): Promise<CertificationRequest> {
    return new CertificationRequest(await StateId.fromCertificationData(certificationData), certificationData, receipt);
  }

  /**
   * Convert the request to a CBOR bytes.
   *
   * @returns CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.stateId.toCBOR(),
      this.certificationData.toCBOR(),
      CborSerializer.encodeBoolean(this.receipt),
      CborSerializer.encodeUnsignedInteger(0),
    );
  }
}
