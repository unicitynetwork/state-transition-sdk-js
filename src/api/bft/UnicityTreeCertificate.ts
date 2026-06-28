import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborError } from '../../serialization/cbor/CborError.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Hash step in the certificate.
 */
class HashStep {
  public constructor(
    public readonly key: bigint,
    private readonly _hash: Uint8Array,
  ) {
    this._hash = new Uint8Array(_hash);
  }

  /**
   * Get the hash.
   */
  public get hash(): Uint8Array {
    return new Uint8Array(this._hash);
  }

  /**
   * Create hash step from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return hash step
   */
  public static fromCBOR(bytes: Uint8Array): HashStep {
    const data = CborDeserializer.decodeArray(bytes, 2);

    return new HashStep(CborDeserializer.decodeUnsignedInteger(data[0]), CborDeserializer.decodeByteString(data[1]));
  }

  /**
   * Convert hash step to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(this.key),
      CborSerializer.encodeByteString(this._hash),
    );
  }

  /**
   * Returns a string representation of the UnicityTreeCertificate.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Hash Step
        Key: ${this.key}
        Hash: ${HexConverter.encode(this._hash)}`;
  }
}

/**
 * Unicity tree certificate.
 */
export class UnicityTreeCertificate {
  public static readonly CBOR_TAG = 39004n;
  private static readonly VERSION = 1n;

  public constructor(
    public readonly partitionIdentifier: bigint,
    private readonly _steps: HashStep[],
  ) {
    this._steps = _steps.slice();
  }

  /**
   * Get the steps.
   */
  public get steps(): HashStep[] {
    return this._steps.slice();
  }

  /**
   * @returns {bigint} Wire-format version of this certificate.
   */
  public get version(): bigint {
    return UnicityTreeCertificate.VERSION;
  }

  /**
   * Create certificate from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return certificate
   */
  public static fromCBOR(bytes: Uint8Array): UnicityTreeCertificate {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== UnicityTreeCertificate.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for UnicityTreeCertificate: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data, 3);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== UnicityTreeCertificate.VERSION) {
      throw new CborError(`Unsupported UnicityTreeCertificate version: ${version}`);
    }

    return new UnicityTreeCertificate(
      CborDeserializer.decodeUnsignedInteger(data[1]),
      CborDeserializer.decodeArray(data[2]).map((step) => HashStep.fromCBOR(step)),
    );
  }

  /**
   * Convert certificate to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      UnicityTreeCertificate.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        CborSerializer.encodeUnsignedInteger(this.partitionIdentifier),
        CborSerializer.encodeArray(...this._steps.map((step) => step.toCBOR())),
      ),
    );
  }

  /**
   * Returns a string representation of the UnicityTreeCertificate.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Unicity Tree Certificate
        Version: ${this.version}
        Partition Identifier: ${this.partitionIdentifier}
        Steps: [
          ${this._steps.map((step) => step.toString()).join('\n')}
        ]`;
  }
}
