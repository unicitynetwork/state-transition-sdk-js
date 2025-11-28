import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

/**
 * Hash step in the certificate.
 */
class HashStep {
  private constructor(
    public readonly key: bigint,
    private readonly _hash: Uint8Array,
  ) {
    this._hash = new Uint8Array(_hash);
  }

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
    const data = CborDeserializer.readArray(bytes);

    return new HashStep(CborDeserializer.readUnsignedInteger(data[0]), CborDeserializer.readByteString(data[1]));
  }

  /**
   * Convert hash step to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(this.key),
      CborSerializer.encodeByteString(this.hash),
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
  public constructor(
    public readonly version: bigint,
    public readonly partitionIdentifier: bigint,
    private readonly _steps: HashStep[],
  ) {
    this._steps = _steps.slice();
  }

  public get steps(): HashStep[] {
    return this._steps.slice();
  }

  /**
   * Create certificate from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return certificate
   */
  public static fromCBOR(bytes: Uint8Array): UnicityTreeCertificate {
    const tag = CborDeserializer.readTag(bytes);
    const data = CborDeserializer.readArray(tag.data);

    return new UnicityTreeCertificate(
      CborDeserializer.readUnsignedInteger(data[0]),
      CborDeserializer.readUnsignedInteger(data[1]),
      CborDeserializer.readArray(data[2]).map((step) => HashStep.fromCBOR(step)),
    );
  }

  /**
   * Convert certificate to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      1014,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        CborSerializer.encodeUnsignedInteger(this.partitionIdentifier),
        CborSerializer.encodeArray(...this.steps.map((step) => step.toCBOR())),
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
          ${this.steps.map((step) => step.toString()).join('\n')}
        ]`;
  }
}
