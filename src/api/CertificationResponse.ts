import { InvalidJsonStructureError } from '../serialization/json/InvalidJsonStructureError.js';

/**
 * Possible results from the aggregator when submitting a certification request.
 */
export enum CertificationStatus {
  /** The certification request was accepted and stored. */
  SUCCESS = 'SUCCESS',
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
  /** The round's reference time had already reached the request's timeout. */
  REQUEST_EXPIRED = 'REQUEST_EXPIRED',
  /** The service has not obtained a consensus reference time yet. */
  SERVICE_NOT_READY = 'SERVICE_NOT_READY',
  /**
   * Sent by a server that has compared the queued request with this one and found them identical (a harmless
   * resubmission): the same signed request is held, wait for its proof as after `SUCCESS`. The SDK never infers this
   * from an error, see {@link CertificationStatus.STATE_ID_QUEUED}.
   */
  ALREADY_SUBMITTED = 'ALREADY_SUBMITTED',
  /**
   * Classified by this SDK, never sent by a server: the aggregator's queue rejected the submission because a request
   * for this state id is already queued (a duplicate key error on the state id). **That request may not be this one**:
   * the queue's only uniqueness is the state id, so a different transaction for the same state is rejected in the same
   * way, and the queued one will be certified instead. Nothing about this submission was accepted. Wait for the proof
   * and compare it with the transaction (`waitInclusionProof` fails with `InclusionProofConflictError` when the
   * certified request is another one); do not treat it as sent.
   */
  STATE_ID_QUEUED = 'STATE_ID_QUEUED',
}

/**
 * JSON shape of a certification response.
 */
export interface ICertificationResponseJson {
  readonly status: string;
}

/**
 * Response object returned by the aggregator on certification request.
 *
 * The status is deliberately tolerant: the aggregator may emit status strings unknown to this SDK
 * version (older deployments, or statuses added later). An unknown status parses successfully and
 * must be treated by callers as "the request was not accepted" — the caller then probes
 * `getInclusionProof` to learn the state's actual certification, instead of failing on parse.
 */
export class CertificationResponse {
  /** The aggregator's status string. Known values are enumerated in {@link CertificationStatus};
   * compare against those members. Unknown strings are preserved as-is. */
  public constructor(public readonly status: string) {}

  /**
   * @returns {boolean} True for `SUCCESS` and for `ALREADY_SUBMITTED` (a server confirmed that this very request is
   *   already held): in both cases the submission is accepted and the next step is waiting for the inclusion proof.
   *   False for `STATE_ID_QUEUED`: a request for the state id is queued, possibly another one.
   */
  public get isAccepted(): boolean {
    return this.status === String(CertificationStatus.SUCCESS) || this.isAlreadySubmitted;
  }

  /**
   * @returns {boolean} True if a server confirmed that it already held this request (see
   *   {@link CertificationStatus.ALREADY_SUBMITTED}).
   */
  public get isAlreadySubmitted(): boolean {
    return this.status === String(CertificationStatus.ALREADY_SUBMITTED);
  }

  /**
   * @returns {boolean} True if the submission was rejected because a request for the same state id is already queued,
   *   which may be a different transaction (see {@link CertificationStatus.STATE_ID_QUEUED}). Not accepted.
   */
  public get isStateIdQueued(): boolean {
    return this.status === String(CertificationStatus.STATE_ID_QUEUED);
  }

  /**
   * Create a new certification response.
   * @param {string} status Certification response status (unknown strings allowed — see class doc)
   *
   * @returns {CertificationResponse} Created certification response
   */
  public static create(status: string): CertificationResponse {
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
      data.status.length > 0
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
