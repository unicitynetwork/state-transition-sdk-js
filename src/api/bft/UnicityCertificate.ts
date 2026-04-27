import { InputRecord } from './InputRecord.js';
import { ShardTreeCertificate } from './ShardTreeCertificate.js';
import { UnicitySeal } from './UnicitySeal.js';
import { UnicityTreeCertificate } from './UnicityTreeCertificate.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { DataHasher } from '../../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../crypto/hash/HashAlgorithm.js';
import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborError } from '../../serialization/cbor/CborError.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Unicity certificate.
 */
export class UnicityCertificate {
  public static readonly CBOR_TAG = 39001n;
  private static readonly VERSION = 1n;

  public constructor(
    public readonly inputRecord: InputRecord,
    private readonly _technicalRecordHash: Uint8Array | null,
    private readonly _shardConfigurationHash: Uint8Array,
    public readonly shardTreeCertificate: ShardTreeCertificate,
    public readonly unicityTreeCertificate: UnicityTreeCertificate,
    public readonly unicitySeal: UnicitySeal,
  ) {
    this._technicalRecordHash = _technicalRecordHash ? new Uint8Array(_technicalRecordHash) : null;
    this._shardConfigurationHash = new Uint8Array(_shardConfigurationHash);
  }

  public get shardConfigurationHash(): Uint8Array {
    return new Uint8Array(this._shardConfigurationHash);
  }

  public get technicalRecordHash(): Uint8Array | null {
    return this._technicalRecordHash ? new Uint8Array(this._technicalRecordHash) : null;
  }

  public get version(): bigint {
    return UnicityCertificate.VERSION;
  }

  /**
   * Calculate the root hash of the shard tree certificate.
   *
   * @param {InputRecord} inputRecord            input record
   * @param {Uint8Array | null} technicalRecordHash    technical record hash
   * @param {Uint8Array} shardConfigurationHash shard configuration hash
   * @param {ShardTreeCertificate} shardTreeCertificate   shard tree certificate
   * @return root hash
   */
  public static async calculateShardTreeCertificateRootHash(
    inputRecord: InputRecord,
    technicalRecordHash: Uint8Array | null,
    shardConfigurationHash: Uint8Array,
    shardTreeCertificate: ShardTreeCertificate,
  ): Promise<DataHash> {
    let rootHash = await new DataHasher(HashAlgorithm.SHA256)
      .update(inputRecord.toCBOR())
      .update(CborSerializer.encodeNullable(technicalRecordHash, CborSerializer.encodeByteString))
      .update(CborSerializer.encodeByteString(shardConfigurationHash))
      .digest();

    const shardId = shardTreeCertificate.shard;
    const siblingHashes = shardTreeCertificate.siblingHashList;
    for (let i = 0; i < siblingHashes.length; i++) {
      const isRight = shardId.getBit(shardId.length - 1 - i);
      if (isRight) {
        rootHash = await new DataHasher(HashAlgorithm.SHA256)
          .update(CborSerializer.encodeByteString(siblingHashes[i]))
          .update(CborSerializer.encodeByteString(rootHash.data))
          .digest();
      } else {
        rootHash = await new DataHasher(HashAlgorithm.SHA256)
          .update(CborSerializer.encodeByteString(rootHash.data))
          .update(CborSerializer.encodeByteString(siblingHashes[i]))
          .digest();
      }
    }

    return rootHash;
  }

  /**
   * Create unicity certificate from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return unicity certificate
   */
  public static fromCBOR(bytes: Uint8Array): UnicityCertificate {
    const tag = CborDeserializer.decodeTag(bytes);
    if (tag.tag !== UnicityCertificate.CBOR_TAG) {
      throw new CborError(`Invalid CBOR tag for UnicityCertificate: ${tag.tag}`);
    }

    const data = CborDeserializer.decodeArray(tag.data);
    const version = CborDeserializer.decodeUnsignedInteger(data[0]);
    if (version !== UnicityCertificate.VERSION) {
      throw new CborError(`Unsupported UnicityCertificate version: ${version}`);
    }

    return new UnicityCertificate(
      InputRecord.fromCBOR(data[1]),
      CborDeserializer.decodeNullable(data[2], CborDeserializer.decodeByteString),
      CborDeserializer.decodeByteString(data[3]),
      ShardTreeCertificate.fromCBOR(data[4]),
      UnicityTreeCertificate.fromCBOR(data[5]),
      UnicitySeal.fromCBOR(data[6]),
    );
  }

  public static fromJSON(data: unknown): UnicityCertificate {
    if (!UnicityCertificate.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return UnicityCertificate.fromCBOR(HexConverter.decode(data));
  }

  private static isJSON(input: unknown): input is string {
    return typeof input === 'string';
  }

  /**
   * Convert unicity certificate to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeTag(
      UnicityCertificate.CBOR_TAG,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        this.inputRecord.toCBOR(),
        CborSerializer.encodeNullable(this.technicalRecordHash, CborSerializer.encodeByteString),
        CborSerializer.encodeByteString(this.shardConfigurationHash),
        this.shardTreeCertificate.toCBOR(),
        this.unicityTreeCertificate.toCBOR(),
        this.unicitySeal.toCBOR(),
      ),
    );
  }

  /**
   * Returns a string representation of the UnicityCertificate.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Unicity Certificate
        Version: ${this.version.toString()}
        ${this.inputRecord.toString()}
        Technical Record Hash: ${this.technicalRecordHash ? HexConverter.encode(this.technicalRecordHash) : 'null'}
        Shard Configuration Hash: ${HexConverter.encode(this.shardConfigurationHash)}
        ${this.shardTreeCertificate.toString()}
        ${this.unicityTreeCertificate.toString()}
        ${this.unicitySeal.toString()}`;
  }
}
