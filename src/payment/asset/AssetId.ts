import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { BitString } from '../../util/BitString.js';

/** Identifier for a asset. */
export class AssetId {
  /**
   * @param _bytes Raw byte representation
   */
  public constructor(private readonly _bytes: Uint8Array) {
    this._bytes = new Uint8Array(_bytes);
  }

  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  /**
   * Creates a AssetId from a byte array encoded in CBOR.
   * @param bytes
   */
  public static fromCBOR(bytes: Uint8Array): AssetId {
    return new AssetId(CborDeserializer.decodeByteString(bytes));
  }

  /**
   * Converts the AssetId to a bitstring representation.
   */
  public toBitString(): BitString {
    return BitString.fromBytes(this._bytes);
  }

  /** CBOR serialization. */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  public toString(): string {
    return HexConverter.encode(this._bytes);
  }
}
