import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

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

  /**
   * Get the shard.
   */
  public get shard(): Uint8Array {
    return new Uint8Array(this._shard);
  }

  /**
   * Get the sibling hash list.
   */
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
    const data = CborDeserializer.decodeArray(bytes);

    return new ShardTreeCertificate(
      CborDeserializer.decodeByteString(data[0]),
      CborDeserializer.decodeArray(data[1]).map((hash) => CborDeserializer.decodeByteString(hash)),
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

  /**
   * Returns a string representation of the ShardTreeCertificate.
   * @returns The string representation.
   */
  public toString(): string {
    return dedent`
      Shard Tree Certificate
        Shard: ${HexConverter.encode(this._shard)}
        Sibling Hash List: [
          ${this._siblingHashList.map((hash) => HexConverter.encode(hash)).join('\n')}
        ]`;
  }
}
