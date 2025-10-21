import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';

/**
 * Shard tree certificate.
 */
export class ShardTreeCertificate {
  public constructor(
    private readonly _shard: Uint8Array,
    private readonly _siblingHashList: Uint8Array[],
  ) {
    this._shard = new Uint8Array(_shard);
    this._siblingHashList = _siblingHashList.map((hash) => new Uint8Array(hash));
  }

  public get shard(): Uint8Array {
    return new Uint8Array(this._shard);
  }

  public get siblingHashList(): Uint8Array[] {
    return this._siblingHashList.map((hash) => new Uint8Array(hash));
  }

  /**
   * Create shard tree certificate from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return shard tree certificate
   */
  public static fromCBOR(bytes: Uint8Array): ShardTreeCertificate {
    const data = CborDeserializer.readArray(bytes);

    return new ShardTreeCertificate(
      CborDeserializer.readByteString(data[0]),
      CborDeserializer.readArray(data[1]).map((hash) => CborDeserializer.readByteString(hash)),
    );
  }

  /**
   * Convert shard tree certificate to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(this.shard),
      CborSerializer.encodeArray(...this._siblingHashList.map((hash) => CborSerializer.encodeByteString(hash))),
    );
  }
}
