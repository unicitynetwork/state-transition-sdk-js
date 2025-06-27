import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { BigintConverter } from '@unicitylabs/commons/lib/util/BigintConverter.js';
import { BitString } from '@unicitylabs/commons/lib/util/BitString.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

/** Identifier for a fungible coin type. */
export class CoinId {
  /**
   * @param data Raw byte representation
   */
  public constructor(private readonly data: Uint8Array) {
    this.data = new Uint8Array(data);
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
    return new CoinId(CborDecoder.readByteString(data));
  }

  /**
   * Creates a CoinId from a bigint.
   * @param value bigint represantation of coin id
   */
  public static fromBigInt(value: bigint): CoinId {
    return CoinId.fromCBOR(BigintConverter.encode(value).slice(1));
  }

  /** Hex string representation. */
  public toJSON(): string {
    return HexConverter.encode(this.data);
  }

  /** CBOR serialization. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeByteString(this.data);
  }

  /**
   * Converts the CoinId to a BigInt representation.
   */
  public toBitString(): BitString {
    return new BitString(this.toCBOR());
  }
}
