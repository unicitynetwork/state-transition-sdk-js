import { RequestId } from './RequestId.js';
import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { ISigningService } from '../sign/ISigningService.js';
import { Signature } from '../sign/Signature.js';
import { SigningService } from '../sign/SigningService.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Possible results from the aggregator when submitting a commitment.
 */
export enum SubmitCommitmentStatus {
  /** The commitment was accepted and stored. */
  SUCCESS = 'SUCCESS',
  /** Signature verification failed. */
  AUTHENTICATOR_VERIFICATION_FAILED = 'AUTHENTICATOR_VERIFICATION_FAILED',
  /** Request identifier did not match the payload. */
  REQUEST_ID_MISMATCH = 'REQUEST_ID_MISMATCH',
  /** A commitment with the same request id already exists. */
  REQUEST_ID_EXISTS = 'REQUEST_ID_EXISTS',
}

/**
 * Request object sent by the client to the aggregator.
 */
class Request {
  public readonly service: string;
  public readonly method: string;
  public readonly requestId: RequestId;
  public readonly stateHash: DataHash;
  public readonly transactionHash: DataHash;
  public readonly hash: DataHash;

  private constructor(
    service: string,
    method: string,
    requestId: RequestId,
    stateHash: DataHash,
    transactionHash: DataHash,
    hash: DataHash,
  ) {
    this.service = service;
    this.method = method;
    this.requestId = requestId;
    this.stateHash = stateHash;
    this.transactionHash = transactionHash;
    this.hash = hash;
  }

  public static async create(
    service: string,
    method: string,
    requestId: RequestId,
    stateHash: DataHash,
    transactionHash: DataHash,
  ): Promise<Request> {
    const cborBytes = CborSerializer.encodeArray(
      CborSerializer.encodeTextString(service),
      CborSerializer.encodeTextString(method),
      requestId.toCBOR(),
      stateHash.toCBOR(),
      transactionHash.toCBOR(),
    );

    const hash = await new DataHasher(HashAlgorithm.SHA256).update(cborBytes).digest();
    return new Request(service, method, requestId, stateHash, transactionHash, hash);
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeTextString(this.service),
      CborSerializer.encodeTextString(this.method),
      this.requestId.toCBOR(),
      this.stateHash.toCBOR(),
      this.transactionHash.toCBOR(),
    );
  }

  public toJSON(): IRequestJson {
    return {
      method: this.method,
      requestId: this.requestId.toJSON(),
      service: this.service,
      stateHash: this.stateHash.toJSON(),
      transactionHash: this.transactionHash.toJSON(),
    };
  }

  public toString(): string {
    return dedent`
      Request
        Service: ${this.service}
        Method: ${this.method}
        Request ID: ${this.requestId.toString()}
        State Hash: ${this.stateHash.toString()}
        Transaction Hash: ${this.transactionHash.toString()}
      `;
  }
}

export interface IRequestJson {
  readonly service: string;
  readonly method: string;
  readonly requestId: string;
  readonly stateHash: string;
  readonly transactionHash: string;
}

export interface ISubmitCommitmentResponseJson {
  readonly status: SubmitCommitmentStatus;
  request?: IRequestJson;
  algorithm?: string;
  publicKey?: string;
  signature?: string;
}

/**
 * Receipt information for a successful commitment submission.
 */
export interface IReceipt {
  algorithm: string;
  publicKey: string;
  signature: Signature;
  request: Request;
}

/**
 * Response object returned by the aggregator on commitment submission.
 */
export class SubmitCommitmentResponse {
  public constructor(
    public readonly status: SubmitCommitmentStatus,
    public receipt?: IReceipt,
  ) {}

  /**
   * Parse a JSON response object.
   *
   * @param data Raw response
   * @returns Parsed response
   * @throws Error if the data does not match the expected shape
   */
  public static async fromJSON(data: unknown): Promise<SubmitCommitmentResponse> {
    if (!SubmitCommitmentResponse.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    let receipt: IReceipt | undefined;
    if (data.request && data.algorithm && data.publicKey && data.signature) {
      const request = await Request.create(
        data.request.service,
        data.request.method,
        RequestId.fromJSON(data.request.requestId),
        DataHash.fromJSON(data.request.stateHash),
        DataHash.fromJSON(data.request.transactionHash),
      );

      receipt = {
        algorithm: data.algorithm,
        publicKey: data.publicKey,
        request,
        signature: Signature.fromJSON(data.signature),
      };
    }

    return new SubmitCommitmentResponse(data.status, receipt);
  }

  /**
   * Check if the given data is a valid JSON response object.
   *
   * @param data Raw response
   * @returns True if the data is a valid JSON response object
   */
  public static isJSON(data: unknown): data is ISubmitCommitmentResponseJson {
    return typeof data === 'object' && data !== null && 'status' in data && typeof data.status === 'string';
  }

  /**
   * Convert the response to a JSON object.
   *
   * @returns JSON representation of the response
   */
  public toJSON(): ISubmitCommitmentResponseJson {
    return {
      algorithm: this.receipt?.algorithm,
      publicKey: this.receipt?.publicKey,
      request: this.receipt?.request.toJSON(),
      signature: this.receipt?.signature.toJSON(),
      status: this.status,
    };
  }

  public async addSignedReceipt(
    requestId: RequestId,
    stateHash: DataHash,
    transactionHash: DataHash,
    signingService: ISigningService<Signature>,
  ): Promise<void> {
    const request = await Request.create(
      'aggregator', // TODO use actual service identifier
      'submit_commitment',
      requestId,
      stateHash,
      transactionHash,
    );

    const signature = await signingService.sign(request.hash);

    this.receipt = {
      algorithm: signingService.algorithm,
      publicKey: HexConverter.encode(signingService.publicKey),
      request,
      signature,
    };
  }

  /**
   * Verify the receipt of the commitment.
   *
   * @returns True if the receipt is valid, false otherwise
   */
  public verifyReceipt(): Promise<boolean> {
    if (!this.receipt) {
      return Promise.resolve(false);
    }

    return SigningService.verifyWithPublicKey(
      this.receipt.request.hash,
      this.receipt.signature.bytes,
      HexConverter.decode(this.receipt.publicKey),
    );
  }
}
