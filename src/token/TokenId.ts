import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

/**
 * Globally unique identifier of a token.
 */
export class TokenId {
  /**
   * @param _bytes Byte representation of the identifier
   */
  public constructor(private readonly _bytes: Uint8Array) {
    this._bytes = new Uint8Array(_bytes);
  }

  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  /** Factory method to wrap a raw identifier. */
  public static create(id: Uint8Array): TokenId {
    return new TokenId(id);
  }

  /** Encode as a hex string for JSON. */
  public toJSON(): string {
    return HexConverter.encode(this._bytes);
  }

  /** CBOR serialisation. */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeByteString(this._bytes);
  }

  /** Convert instance to readable string */
  public toString(): string {
    return `TokenId[${HexConverter.encode(this._bytes)}]`;
  }

  /**
   * Converts the TokenId to a BigInt representation.
   */
  public toBigInt(): bigint {
    return BigInt(`0x01${HexConverter.encode(this.toCBOR())}`);
  }
}
