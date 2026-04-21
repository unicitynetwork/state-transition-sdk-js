import { DataHash } from '../crypto/hash/DataHash.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { MintSigningService } from '../crypto/MintSigningService.js';
import { PayToPublicKeyPredicateUnlockScript } from '../predicate/builtin/PayToPublicKeyPredicateUnlockScript.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { IUnlockScript } from '../predicate/IUnlockScript.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborError } from '../serialization/cbor/CborError.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { ITransaction } from '../transaction/ITransaction.js';
import { MintTransaction } from '../transaction/MintTransaction.js';
import { dedent } from '../util/StringUtils.js';

export class CertificationData {
  public static readonly CBOR_TAG = 39031n;
  private static readonly VERSION = 1n;

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

  public get version(): bigint {
    return CertificationData.VERSION;
  }

  /**
   * Create CertificationData from CBOR bytes.
   * @param {Uint8Array} bytes CBOR bytes
   *
   * @returns {CertificationData} certification data
   */
  public static fromCBOR(bytes: Uint8Array): CertificationData {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== CertificationData.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for CertificationData: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== CertificationData.VERSION) {
      throw new CborError(`Unsupported CertificationData version: ${version}`);
    }

    return new CertificationData(
      EncodedPredicate.fromCBOR(data[1]),
      new DataHash(HashAlgorithm.SHA256, CborDeserializer.decodeByteString(data[2])),
      new DataHash(HashAlgorithm.SHA256, CborDeserializer.decodeByteString(data[3])),
      CborDeserializer.decodeByteString(data[4]),
    );
  }

  public static async fromMintTransaction(transaction: MintTransaction): Promise<CertificationData> {
    const signingService = await MintSigningService.create(transaction.tokenId);

    return CertificationData.fromTransaction(
      transaction,
      await PayToPublicKeyPredicateUnlockScript.create(transaction, signingService),
    );
  }

  public static async fromTransaction(
    transaction: ITransaction,
    unlockScript: IUnlockScript,
  ): Promise<CertificationData> {
    const transactionHash = await transaction.calculateTransactionHash();

    return new CertificationData(
      transaction.lockScript,
      transaction.sourceStateHash,
      transactionHash,
      unlockScript.encode(),
    );
  }

  /**
   * Convert the certification data to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      CertificationData.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        EncodedPredicate.fromPredicate(this.lockScript).toCBOR(),
        CborSerializer.encodeByteString(this.sourceStateHash.data),
        CborSerializer.encodeByteString(this.transactionHash.data),
        CborSerializer.encodeByteString(this._unlockScript),
      ),
    );
  }

  /**
   * Returns a string representation of the CertificationData.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Certification Data
        Version: ${CertificationData.VERSION}
        Owner Predicate: 
          ${this.lockScript.toString()}
        Source State Hash: ${this.sourceStateHash.toString()}
        Transaction Hash: ${this.transactionHash.toString()}
        Witness: ${HexConverter.encode(this._unlockScript)}`;
  }
}
