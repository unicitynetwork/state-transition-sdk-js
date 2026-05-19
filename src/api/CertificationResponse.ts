import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';

/**
 * Possible results from the aggregator when submitting a certification request.
 */
export enum CertificationStatus {
  /** The certification request was accepted and stored. */
  SUCCESS = 'SUCCESS',
  /** State identifier exists. */
  STATE_ID_EXISTS = 'STATE_ID_EXISTS',
  /** State identifier did not match the payload. */
  STATE_ID_MISMATCH = 'STATE_ID_MISMATCH',
  /** Signature verification failed. */
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  /** The signature format is invalid. */
  INVALID_SIGNATURE_FORMAT = 'INVALID_SIGNATURE_FORMAT',
  /** The public key format is invalid. */
  INVALID_PUBLIC_KEY_FORMAT = 'INVALID_PUBLIC_KEY_FORMAT',
  /** The source state hash format is invalid. */
  INVALID_SOURCE_STATE_HASH_FORMAT = 'INVALID_SOURCE_STATE_HASH_FORMAT',
  /** The transaction hash format is invalid. */
  INVALID_TRANSACTION_HASH_FORMAT = 'INVALID_TRANSACTION_HASH_FORMAT',
  /** The specified algorithm is not supported. */
  UNSUPPORTED_ALGORITHM = 'UNSUPPORTED_ALGORITHM',
  /** The certification request was submitted to an invalid shard. */
  INVALID_SHARD = 'INVALID_SHARD',
}

/**
 * JSON shape of a certification response.
 */
export interface ICertificationResponseJson {
  readonly status: CertificationStatus;
}

/**
 * Response object returned by the aggregator on certification request.
 */
export class CertificationResponse {
  public constructor(public readonly status: CertificationStatus) {}

  /**
   * Create a new certification response.
   * @param {CertificationStatus} status Certification response status
   *
   * @returns {CertificationResponse} Created certification response
   */
  public static create(status: CertificationStatus): CertificationResponse {
    return new CertificationResponse(status);
  }

  /**
   * Parse a JSON response object.
   *
   * @param {unknown} data Raw response
   * @returns {Promise<>CertificationResponse>} Parsed response
   * @throws {InvalidJsonStructureError} Error if the data does not match the expected shape
   */
  public static fromJSON(data: unknown): CertificationResponse {
    if (!CertificationResponse.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new CertificationResponse(data.status);
  }

  /**
   * Check if the given data is a valid JSON response object.
   *
   * @param {unknown} data Raw response
   * @returns {boolean} True if the data is a valid JSON response object
   */
  public static isJSON(data: unknown): data is ICertificationResponseJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'status' in data &&
      typeof data.status === 'string' &&
      !!CertificationStatus[data.status as keyof typeof CertificationStatus]
    );
  }

  /**
   * Convert the response to a JSON object.
   *
   * @returns {ICertificationResponseJson} JSON representation of the response
   */
  public toJSON(): ICertificationResponseJson {
    return {
      status: this.status,
    };
  }
}
