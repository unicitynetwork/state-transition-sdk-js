import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { BitString } from '../../util/BitString.js';
import { HexConverter } from '../../util/HexConverter.js';

/** Identifier for a asset. */
export class AssetId {
  public constructor(private readonly _bytes: Uint8Array) {
    this._bytes = new Uint8Array(_bytes);
  }

  /**
   * @returns {Uint8Array} Copy of the asset id bytes.
   */
  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  /**
   * Create AssetId from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {AssetId} Decoded asset id.
   */
  public static fromCBOR(bytes: Uint8Array): AssetId {
    return new AssetId(CborDeserializer.decodeByteString(bytes));
  }

  /**
   * Convert the AssetId to a bit-string representation.
   *
   * @returns {BitString} Bit-string view of the asset id.
   */
  public toBitString(): BitString {
    return BitString.fromBytes(this._bytes);
  }

  /**
   * Convert AssetId to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  /**
   * @returns {string} Hex string representation of the asset id.
   */
  public toString(): string {
    return HexConverter.encode(this._bytes);
  }
}
