import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { InputRecord } from './InputRecord.js';
import { ShardTreeCertificate } from './ShardTreeCertificate.js';
import { UnicitySeal } from './UnicitySeal.js';
import { UnicityTreeCertificate } from './UnicityTreeCertificate.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Unicity certificate.
 */
export class UnicityCertificate {
  public constructor(
    public readonly version: bigint,
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

  public get technicalRecordHash(): Uint8Array | null {
    return this._technicalRecordHash ? new Uint8Array(this._technicalRecordHash) : null;
  }

  public get shardConfigurationHash(): Uint8Array {
    return new Uint8Array(this._shardConfigurationHash);
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
      .update(CborSerializer.encodeOptional(technicalRecordHash, CborSerializer.encodeByteString))
      .update(CborSerializer.encodeByteString(shardConfigurationHash))
      .digest();

    const shardId = shardTreeCertificate.shard;
    const siblingHashes = shardTreeCertificate.getSiblingHashList();
    for (let i = 0; i < siblingHashes.length; i++) {
      const isRight = shardId[shardId.length - 1 - Math.floor(i / 8)] === 1;
      if (isRight) {
        rootHash = await new DataHasher(HashAlgorithm.SHA256).update(siblingHashes[i]).update(rootHash.data).digest();
      } else {
        rootHash = await new DataHasher(HashAlgorithm.SHA256).update(rootHash.data).update(siblingHashes[i]).digest();
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
    const tag = CborDeserializer.readTag(bytes);
    const data = CborDeserializer.readArray(tag.data);

    return new UnicityCertificate(
      CborDeserializer.readUnsignedInteger(data[0]),
      InputRecord.fromCBOR(data[1]),
      CborDeserializer.readOptional(data[2], CborDeserializer.readByteString),
      CborDeserializer.readByteString(data[3]),
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
      1007,
      CborSerializer.encodeArray(
        CborSerializer.encodeUnsignedInteger(this.version),
        this.inputRecord.toCBOR(),
        CborSerializer.encodeOptional(this.technicalRecordHash, CborSerializer.encodeByteString),
        CborSerializer.encodeByteString(this.shardConfigurationHash),
        this.shardTreeCertificate.toCBOR(),
        this.unicityTreeCertificate.toCBOR(),
        this.unicitySeal.toCBOR(),
      ),
    );
  }

  public toJSON(): string {
    return HexConverter.encode(this.toCBOR());
  }
}
