import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { MintSigningService } from '../crypto/MintSigningService.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { MintTransaction } from '../transaction/MintTransaction.js';
import { TransferTransaction } from '../transaction/TransferTransaction.js';
import { dedent } from '../util/StringUtils.js';

/**
 * JSON representation of a certification data.
 */
export interface ICertificationDataJson {
  /** The lock predicate as a hex string. */
  readonly ownerPredicate: string;
  /** The source state hash imprint as a hex string. */
  readonly sourceStateHash: string;
  /** The transaction hash imprint as a hex string. */
  readonly transactionHash: string;
  /** The witness as a hex string. */
  readonly witness: string;
}

export class CertificationData {
  /**
   * Create a certification data object.
   * @param {IPredicate} lockScript
   * @param {DataHash} sourceStateHash
   * @param {DataHash} transactionHash
   * @param {Uint8Array} _unlockScript Unlock script bytes
   */
  private constructor(
    public readonly lockScript: IPredicate,
    public readonly sourceStateHash: DataHash,
    public readonly transactionHash: DataHash,
    private readonly _unlockScript: Uint8Array,
  ) {
    this._unlockScript = new Uint8Array(_unlockScript);
  }

  /**
   * Get the unlock script.
   */
  public get unlockScript(): Uint8Array {
    return new Uint8Array(this._unlockScript);
  }

  /**
   * Create CertificationData from CBOR bytes.
   * @param {Uint8Array} bytes CBOR bytes
   *
   * @returns {CertificationData} certification data
   */
  public static fromCBOR(bytes: Uint8Array): CertificationData {
    const data = CborDeserializer.decodeArray(bytes);
    return new CertificationData(
      EncodedPredicate.fromCBOR(data[0]),
      DataHash.fromCBOR(data[1]),
      DataHash.fromCBOR(data[2]),
      CborDeserializer.decodeByteString(data[3]),
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
      EncodedPredicate.fromCBOR(HexConverter.decode(data.ownerPredicate)),
      DataHash.fromJSON(data.sourceStateHash),
      DataHash.fromJSON(data.transactionHash),
      HexConverter.decode(data.witness),
    );
  }

  public static async fromMintTransaction(transaction: MintTransaction): Promise<CertificationData> {
    const signingService = await MintSigningService.create(transaction.tokenId);

    const sourceStateHash = await transaction.calculateStateHash();
    const transactionHash = await transaction.calculateTransactionHash();

    const signatureDataHash = await new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeArray(sourceStateHash.toCBOR(), transactionHash.toCBOR()))
      .digest();
    const unlockScript = await signingService.sign(signatureDataHash);

    return CertificationData.create(transaction.lockScript, sourceStateHash, transactionHash, unlockScript.encode());
  }

  public static async fromTransferTransaction(
    transaction: TransferTransaction,
    unlockScript: Uint8Array,
  ): Promise<CertificationData> {
    unlockScript = new Uint8Array(unlockScript);

    const sourceStateHash = await transaction.calculateStateHash();
    const transactionHash = await transaction.calculateTransactionHash();

    return CertificationData.create(transaction.lockScript, sourceStateHash, transactionHash, unlockScript);
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
      'ownerPredicate' in data &&
      typeof data.ownerPredicate === 'string' &&
      'sourceStateHash' in data &&
      typeof data.sourceStateHash === 'string' &&
      'transactionHash' in data &&
      typeof data.transactionHash === 'string' &&
      'witness' in data &&
      typeof data.witness === 'string'
    );
  }

  private static create(
    lockScript: IPredicate,
    sourceStateHash: DataHash,
    transactionHash: DataHash,
    unlockScript: Uint8Array,
  ): CertificationData {
    return new CertificationData(lockScript, sourceStateHash, transactionHash, unlockScript);
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
   * Convert the certification data to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.lockScript.toCBOR(),
      this.sourceStateHash.toCBOR(),
      this.transactionHash.toCBOR(),
      CborSerializer.encodeByteString(this._unlockScript),
    );
  }

  /**
   * Convert the certification data to a JSON object.
   * @returns JSON object
   */
  public toJSON(): ICertificationDataJson {
    return {
      ownerPredicate: HexConverter.encode(this.lockScript.toCBOR()),
      sourceStateHash: this.sourceStateHash.toJSON(),
      transactionHash: this.transactionHash.toJSON(),
      witness: HexConverter.encode(this._unlockScript),
    };
  }

  /**
   * Returns a string representation of the CertificationData.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Certification Data
        Owner Predicate: 
          ${this.lockScript.toString()}
        Source State Hash: ${this.sourceStateHash.toString()}
        Transaction Hash: ${this.transactionHash.toString()}
        Witness: ${HexConverter.encode(this._unlockScript)}`;
  }
}
