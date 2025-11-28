import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { BitString } from '../../util/BitString.js';
import { HexConverter } from '../../util/HexConverter.js';

/** Identifier for a fungible coin type. */
export class CoinId {
  /**
   * @param data Raw byte representation
   */
  public constructor(private readonly data: Uint8Array) {
    this.data = new Uint8Array(data);
  }

  public get bytes(): Uint8Array {
    return new Uint8Array(this.data);
  }

  /**
   * Creates a new CoinId from raw bytes.
   * @param data Raw byte representation
   */
  public static fromJSON(data: string): CoinId {
    return new CoinId(HexConverter.decode(data));
  }

  /**
   * Creates a CoinId from a byte array encoded in CBOR.
   * @param data
   */
  public static fromCBOR(data: Uint8Array): CoinId {
    return new CoinId(CborDeserializer.readByteString(data));
  }

  /** Hex string representation. */
  public toJSON(): string {
    return HexConverter.encode(this.data);
  }

  /** CBOR serialization. */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this.data);
  }

  /**
   * Converts the CoinId to a bitstring representation.
   */
  public toBitString(): BitString {
    return new BitString(this.data);
  }

  public toString(): string {
    return `CoinId[${HexConverter.encode(this.data)}]`;
  }
}
