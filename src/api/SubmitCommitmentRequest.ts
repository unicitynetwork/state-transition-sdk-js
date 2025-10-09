import { Authenticator, IAuthenticatorJson } from './Authenticator.js';
import { RequestId } from './RequestId.js';
import { DataHash } from '../hash/DataHash.js';

/**
 * JSON representation of a submit commitment request.
 */
export interface ISubmitCommitmentRequestJson {
  /** The request ID as a string. */
  requestId: string;
  /** The transaction hash as a string. */
  transactionHash: string;
  /** The authenticator as JSON. */
  authenticator: IAuthenticatorJson;
  /** Optional flag to request a receipt. */
  receipt?: boolean;
}

/**
 * Request object sent by the client to the aggregator.
 */
export class SubmitCommitmentRequest {
  /**
   * Constructs a SubmitCommitmentRequest instance.
   * @param requestId The request ID.
   * @param transactionHash The transaction hash.
   * @param authenticator The authenticator.
   * @param receipt Optional flag to request a receipt.
   */
  public constructor(
    public readonly requestId: RequestId,
    public readonly transactionHash: DataHash,
    public readonly authenticator: Authenticator,
    public readonly receipt?: boolean,
  ) {}

  /**
   * Parse a JSON object into a SubmitCommitmentRequest object.
   * @param data Raw request
   * @returns SubmitCommitmentRequest object
   * @throws Error if parsing fails.
   */
  public static fromJSON(data: unknown): SubmitCommitmentRequest {
    if (!SubmitCommitmentRequest.isJSON(data)) {
      throw new Error('Parsing submit state transition request failed.');
    }

    return new SubmitCommitmentRequest(
      RequestId.fromJSON(data.requestId),
      DataHash.fromJSON(data.transactionHash),
      Authenticator.fromJSON(data.authenticator),
      data.receipt,
    );
  }

  /**
   * Check if the given data is a valid JSON request object.
   * @param data Raw request
   * @returns True if the data is a valid JSON request object
   */
  public static isJSON(data: unknown): data is ISubmitCommitmentRequestJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'authenticator' in data &&
      typeof data.authenticator === 'object' &&
      data.authenticator !== null &&
      'requestId' in data &&
      typeof data.requestId === 'string' &&
      'transactionHash' in data &&
      typeof data.transactionHash === 'string'
    );
  }

  /**
   * Convert the request to a JSON object.
   * @returns JSON object
   */
  public toJSON(): ISubmitCommitmentRequestJson {
    return {
      authenticator: this.authenticator.toJSON(),
      receipt: this.receipt,
      requestId: this.requestId.toJSON(),
      transactionHash: this.transactionHash.toJSON(),
    };
  }
}
