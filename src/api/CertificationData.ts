import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { MintSigningService } from '../crypto/MintSigningService.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { MintTransaction } from '../transaction/MintTransaction.js';
import { TransferTransaction } from '../transaction/TransferTransaction.js';
import { dedent } from '../util/StringUtils.js';

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
      new DataHash(HashAlgorithm.SHA256, CborDeserializer.decodeByteString(data[1])),
      new DataHash(HashAlgorithm.SHA256, CborDeserializer.decodeByteString(data[2])),
      CborDeserializer.decodeByteString(data[3]),
    );
  }

  public static async fromMintTransaction(transaction: MintTransaction): Promise<CertificationData> {
    const signingService = await MintSigningService.create(transaction.tokenId);

    const transactionHash = await transaction.calculateTransactionHash();

    const signatureDataHash = await new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(
          CborSerializer.encodeByteString(transaction.sourceStateHash.imprint),
          CborSerializer.encodeByteString(transactionHash.imprint),
        ),
      )
      .digest();
    const unlockScript = await signingService.sign(signatureDataHash);

    return CertificationData.create(
      transaction.lockScript,
      transaction.sourceStateHash,
      transactionHash,
      unlockScript.encode(),
    );
  }

  public static async fromTransferTransaction(
    transaction: TransferTransaction,
    unlockScript: Uint8Array,
  ): Promise<CertificationData> {
    unlockScript = new Uint8Array(unlockScript);
    const transactionHash = await transaction.calculateTransactionHash();

    return CertificationData.create(transaction.lockScript, transaction.sourceStateHash, transactionHash, unlockScript);
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
      CborSerializer.encodeByteString(this.sourceStateHash.data),
      CborSerializer.encodeByteString(this.transactionHash.data),
      CborSerializer.encodeByteString(this._unlockScript),
    );
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
