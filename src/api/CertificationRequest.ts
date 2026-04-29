import { CertificationData } from './CertificationData.js';
import { StateId } from './StateId.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

/**
 * Certification request object sent by the client to the aggregator.
 */
export class CertificationRequest {
  public static readonly CBOR_TAG = 39030n;
  private static readonly VERSION = 1n;

  /**
   * Constructs a CertificationRequest instance.
   * @param {StateId} stateId Unique state identifier.
   * @param {CertificationData} certificationData Certification data.
   */
  private constructor(
    public readonly stateId: StateId,
    public readonly certificationData: CertificationData,
  ) {}

  public get version(): bigint {
    return CertificationRequest.VERSION;
  }

  /**
   * Create a new CertificationRequest instance.
   * @param {CertificationData} certificationData Certification data.
   *
   * @returns {Promise<CertificationRequest>} A promise that resolves to a CertificationRequest instance.
   */
  public static async create(certificationData: CertificationData): Promise<CertificationRequest> {
    return new CertificationRequest(await StateId.fromCertificationData(certificationData), certificationData);
  }

  /**
   * Convert the request to a CBOR bytes.
   *
   * @returns CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      CertificationRequest.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        this.stateId.toCBOR(),
        this.certificationData.toCBOR(),
        CborSerializer.encodeUnsignedInteger(0),
      ),
    );
  }
}
