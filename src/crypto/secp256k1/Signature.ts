import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../util/HexConverter.js';
import { ISignature } from '../ISignature.js';

/**
 * secp256k1 recoverable signature: 64 bytes of compact `(r, s)` plus a
 * single recovery byte used to recover the signer's public key.
 */
export class Signature implements ISignature {
  public readonly algorithm: string = 'secp256k1';

  public constructor(
    private readonly _bytes: Uint8Array,
    public readonly recovery: number,
  ) {
    this._bytes = new Uint8Array(_bytes);
  }

  /**
   * @returns {Uint8Array} Copy of the 64-byte signature.
   */
  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  /**
   * Create Signature from its 65-byte encoding.
   *
   * @param {Uint8Array} bytes 64 signature bytes followed by recovery byte.
   * @returns {Signature} Decoded signature.
   * @throws {Error} If the input is not 65 bytes long or the recovery id is out of range (0–3).
   */
  public static decode(bytes: Uint8Array): Signature {
    if (bytes.length !== 65) {
      throw new Error('Signature must contain signature and recovery byte.');
    }

    const recovery = bytes[bytes.length - 1];
    if (recovery > 3) {
      throw new Error(`Invalid signature recovery id: ${recovery}.`);
    }

    return new Signature(bytes.slice(0, -1), recovery);
  }

  /**
   * Create Signature from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {Signature} Decoded signature.
   */
  public static fromCBOR(bytes: Uint8Array): Signature {
    return Signature.decode(CborDeserializer.decodeByteString(bytes));
  }

  /**
   * Create Signature from JSON.
   *
   * @param {string} data Hex string of the encoded signature.
   * @returns {Signature} Decoded signature.
   */
  public static fromJSON(data: string): Signature {
    return Signature.decode(HexConverter.decode(data));
  }

  /**
   * @returns {Uint8Array} 65-byte concatenation of signature bytes and recovery byte.
   */
  public encode(): Uint8Array {
    return new Uint8Array([...this._bytes, this.recovery]);
  }

  /**
   * Convert Signature to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this.encode());
  }

  /**
   * Convert Signature to JSON.
   *
   * @returns {string} Hex string of the encoded signature.
   */
  public toJSON(): string {
    return HexConverter.encode(this.encode());
  }

  /**
   * @returns {string} Hex string of the encoded signature.
   */
  public toString(): string {
    return `${HexConverter.encode(this.encode())}`;
  }
}
