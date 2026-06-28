import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../util/HexConverter.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';

/**
 * 32-byte random value mixed into a transfer's next state hash. Its randomness
 * makes the next state identifier unpredictable, preventing the Unicity Service
 * from linking consecutive states of the same token, and it MUST be sampled with
 * at least 128 bits of min-entropy.
 */
export class StateMask {
  public static readonly LENGTH = 32;

  private constructor(private readonly _bytes: Uint8Array) {}

  /**
   * @returns {Uint8Array} Copy of the state mask bytes.
   */
  public get bytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  /**
   * Wrap an existing 32-byte state mask.
   *
   * @param {Uint8Array} bytes State mask bytes; must be exactly 32 bytes.
   * @returns {StateMask} New state mask.
   * @throws {Error} If `bytes` is not 32 bytes long.
   */
  public static fromBytes(bytes: Uint8Array): StateMask {
    if (bytes.length !== StateMask.LENGTH) {
      throw new Error(`StateMask must be ${StateMask.LENGTH} bytes long, got ${bytes.length}.`);
    }
    return new StateMask(new Uint8Array(bytes));
  }

  /**
   * Create StateMask from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {StateMask} Decoded state mask.
   */
  public static fromCBOR(bytes: Uint8Array): StateMask {
    return StateMask.fromBytes(CborDeserializer.decodeByteString(bytes));
  }

  /**
   * Generate a fresh random 32-byte StateMask.
   *
   * @returns {StateMask} New random state mask.
   */
  public static generate(): StateMask {
    return new StateMask(crypto.getRandomValues(new Uint8Array(StateMask.LENGTH)));
  }

  /**
   * Equality check against another value.
   *
   * @param {unknown} o Other value.
   * @returns {boolean} True if `o` is a StateMask with the same bytes.
   */
  public equals(o: unknown): boolean {
    if (this === o) {
      return true;
    }
    if (!(o instanceof StateMask)) {
      return false;
    }
    return areUint8ArraysEqual(this._bytes, o._bytes);
  }

  /**
   * Convert StateMask to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeByteString(this._bytes);
  }

  /**
   * @returns {string} Hex representation of the state mask.
   */
  public toString(): string {
    return `StateMask[${HexConverter.encode(this._bytes)}]`;
  }
}
