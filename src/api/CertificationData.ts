import { DataHash } from '../hash/DataHash.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { StateId } from './StateId.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { ISigningService } from '../sign/ISigningService.js';
import { Signature } from '../sign/Signature.js';
import { SigningService } from '../sign/SigningService.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * JSON representation of a certification data.
 */
export interface ICertificationDataJson {
  /** The public key as a hex string. */
  readonly publicKey: string;
  /** The source state hash imprint as a hex string. */
  readonly sourceStateHash: string;
  /** The transaction hash imprint as a hex string. */
  readonly transactionHash: string;
  /** The signature as a hex string. */
  readonly signature: string;
}

export class CertificationData {
  /**
   * Create a certification data object.
   * @param {Uint8Array} _publicKey
   * @param {DataHash} sourceStateHash
   * @param {DataHash} transactionHash
   * @param {Signature} signature Signature bytes
   */
  private constructor(
    private readonly _publicKey: Uint8Array,
    public readonly sourceStateHash: DataHash,
    public readonly transactionHash: DataHash,
    public readonly signature: Signature,
  ) {}

  /**
   * Get the public key.
   */
  public get publicKey(): Uint8Array {
    return new Uint8Array(this._publicKey);
  }

  public static async create(
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    signingService: ISigningService<Signature>,
  ): Promise<CertificationData> {
    return new CertificationData(
      signingService.publicKey,
      sourceStateHash,
      transactionHash,
      await signingService.sign(
        await new DataHasher(HashAlgorithm.SHA256)
          .update(CborSerializer.encodeArray(sourceStateHash.toCBOR(), transactionHash.toCBOR()))
          .digest(),
      ),
    );
  }

  /**
   * Create CertificationData from JSON object.
   * @param {unknown} data Raw certification data
   *
   * @returns {CertificationData} certification data
   * @throws {InvalidJsonStructureError} if the data does not match the expected shape
   */
  public static fromJSON(data: unknown): CertificationData {
    if (!CertificationData.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new CertificationData(
      HexConverter.decode(data.publicKey),
      DataHash.fromJSON(data.sourceStateHash),
      DataHash.fromJSON(data.transactionHash),
      Signature.fromJSON(data.signature),
    );
  }

  /**
   * Check if the given data is a valid JSON certification data object.
   *
   * @param {unknown} data Raw certification data
   *
   * @returns {boolean} True if the data is a valid JSON certification data object
   */
  public static isJSON(data: unknown): data is ICertificationDataJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'publicKey' in data &&
      typeof data.publicKey === 'string' &&
      'sourceStateHash' in data &&
      typeof data.sourceStateHash === 'string' &&
      'transactionHash' in data &&
      typeof data.transactionHash === 'string' &&
      'signature' in data &&
      typeof data.signature === 'string'
    );
  }

  /**
   * Create CertificationData from CBOR bytes.
   * @param {Uint8Array} bytes CBOR bytes
   *
   * @returns {CertificationData} certification data
   */
  public static fromCBOR(bytes: Uint8Array): CertificationData {
    const data = CborDeserializer.readArray(bytes);
    const publicKey = CborDeserializer.readByteString(data[0]);
    const signature = Signature.fromCBOR(data[1]);
    const sourceStateHash = DataHash.fromCBOR(data[2]);
    const transactionHash = DataHash.fromCBOR(data[3]);

    return new CertificationData(publicKey, sourceStateHash, transactionHash, signature);
  }

  /**
   * Calculate the StateId corresponding to this certification data.
   * @returns StateId
   */
  public calculateStateId(): Promise<StateId> {
    return StateId.create(this._publicKey, this.sourceStateHash);
  }

  /**
   * Calculate the leaf value for this certification data.
   *
   * @returns A Promise resolving to the leaf value hash.
   */
  public calculateLeafValue(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(this.toCBOR()).digest();
  }

  /**
   * Verifies current certification data.
   *
   * @returns A Promise resolving to true if valid, false otherwise.
   */
  public async verify(): Promise<boolean> {
    return SigningService.verifyWithPublicKey(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(CborSerializer.encodeArray(this.sourceStateHash.toCBOR(), this.transactionHash.toCBOR()))
        .digest(),
      this.signature.bytes,
      this._publicKey,
    );
  }

  /**
   * Convert the certification data to a JSON object.
   * @returns JSON object
   */
  public toJSON(): ICertificationDataJson {
    return {
      publicKey: HexConverter.encode(this._publicKey),
      signature: this.signature.toJSON(),
      sourceStateHash: this.sourceStateHash.toJSON(),
      transactionHash: this.transactionHash.toJSON(),
    };
  }

  /**
   * Convert the certification data to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(this._publicKey),
      this.signature.toCBOR(),
      this.sourceStateHash.toCBOR(),
      this.transactionHash.toCBOR(),
    );
  }
}
