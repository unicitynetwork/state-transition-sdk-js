import { CertificationData } from './CertificationData.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { ISigningService } from '../sign/ISigningService.js';
import { Signature } from '../sign/Signature.js';
import { SigningService } from '../sign/SigningService.js';
import { HexConverter } from '../util/HexConverter.js';

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

export interface ICertificationResponseJson {
  readonly status: CertificationStatus;
  readonly receipt?: IReceiptJson;
}

/**
 * Receipt information for a successful certification request.
 */
export interface IReceiptJson {
  readonly publicKey: string;
  readonly signature: string;
}

/**
 * Receipt object returned by the aggregator on certification request.
 */
class Receipt {
  public constructor(
    private readonly _publicKey: Uint8Array,
    public readonly signature: Signature,
  ) {}

  public get publicKey(): Uint8Array {
    return new Uint8Array(this._publicKey);
  }

  /**
   * Parse a receipt object from JSON.
   * @param {unknown} data Raw receipt
   * @returns {Receipt} Parsed receipt
   * @throws {InvalidJsonStructureError} InvalidJsonStructureError if the data does not match the expected shape
   */
  public static fromJSON(data: unknown): Receipt {
    if (!Receipt.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new Receipt(HexConverter.decode(data.publicKey), Signature.fromJSON(data.signature));
  }

  /**
   * Check if the given data is a valid JSON receipt object.
   * @param {unknown} data Raw receipt
   * @returns {boolean} True if the data is a valid JSON receipt object
   */
  public static isJSON(data: unknown): data is IReceiptJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'publicKey' in data &&
      typeof data.publicKey === 'string' &&
      'signature' in data &&
      typeof data.signature === 'string'
    );
  }

  /**
   * Parse a receipt object from CBOR bytes.
   * @param {Uint8Array} bytes CBOR-encoded receipt
   * @returns {Receipt} Parsed receipt
   */
  public static fromCBOR(bytes: Uint8Array): Receipt {
    const data = CborDeserializer.readArray(bytes);
    return new Receipt(CborDeserializer.readByteString(data[0]), Signature.fromCBOR(data[1]));
  }

  /**
   * Convert the receipt to CBOR bytes.
   * @returns {Uint8Array} CBOR-encoded receipt
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(CborSerializer.encodeByteString(this._publicKey), this.signature.toCBOR());
  }

  /**
   * Convert the receipt to a JSON object.
   * @returns {IReceiptJson} JSON representation of the receipt
   */
  public toJSON(): IReceiptJson {
    return {
      publicKey: HexConverter.encode(this._publicKey),
      signature: this.signature.toJSON(),
    };
  }
}

/**
 * Response object returned by the aggregator on certification request.
 */
export class CertificationResponse {
  public constructor(
    public readonly status: CertificationStatus,
    public receipt: Receipt | null,
  ) {}

  /**
   * Create a new certification response.
   * @param {ISigningService} signingService Aggregator signing service
   * @param {CertificationResponse} certificationData Certification data
   * @param {CertificationStatus} status Certification response status
   *
   * @returns {Promise<CertificationResponse>} Created certification response
   */
  public static async createWithReceipt(
    signingService: ISigningService<Signature>,
    certificationData: CertificationData,
    status: CertificationStatus,
  ): Promise<CertificationResponse> {
    const signature = await signingService.sign(
      await new DataHasher(HashAlgorithm.SHA256).update(certificationData.toCBOR()).digest(),
    );

    return new CertificationResponse(status, new Receipt(signingService.publicKey, signature));
  }

  /**
   * Create a new certification response.
   * @param {CertificationStatus} status Certification response status
   *
   * @returns {CertificationResponse} Created certification response
   */
  public static create(status: CertificationStatus): CertificationResponse {
    return new CertificationResponse(status, null);
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

    return new CertificationResponse(data.status, data.receipt ? Receipt.fromJSON(data.receipt) : null);
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
      receipt: this.receipt?.toJSON(),
      status: this.status,
    };
  }

  /**
   * Verify the receipt of the commitment.
   *
   * @returns {boolean} True if the receipt is valid, false otherwise
   */
  public async verifyReceipt(certificationData: CertificationData): Promise<boolean> {
    if (!this.receipt) {
      throw new Error('Receipt is not part of the response.');
    }

    return SigningService.verifyWithPublicKey(
      // TODO: Implement whenever this is implemented in aggregator
      await certificationData.calculateLeafValue(),
      this.receipt.signature.bytes,
      this.receipt.publicKey,
    );
  }
}
