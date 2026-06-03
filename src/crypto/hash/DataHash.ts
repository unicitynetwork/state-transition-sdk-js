import { HashAlgorithm } from './HashAlgorithm.js';
import { HashError } from './HashError.js';
import { HexConverter } from '../../util/HexConverter.js';
import { areUint8ArraysEqual } from '../../util/TypedArrayUtils.js';

/**
 * Immutable hash value paired with the {@link HashAlgorithm} that produced
 * it. Carries both the raw `data` bytes and a 2-byte-prefixed `imprint`
 * encoding suitable for storage and comparison across algorithms.
 */
export class DataHash {
  private readonly _imprint: Uint8Array;

  public constructor(
    public readonly algorithm: HashAlgorithm,
    private readonly _data: Uint8Array,
  ) {
    if (_data.length !== algorithm.length) {
      throw new HashError('Invalid data length for the specified hash algorithm.');
    }

    this._data = new Uint8Array(_data);
    this._imprint = new Uint8Array(_data.length + 2);
    this._imprint.set([(algorithm.id & 0xff00) >> 8, algorithm.id & 0xff]);
    this._imprint.set(new Uint8Array(_data), 2);
  }

  /**
   * @returns {Uint8Array} Copy of the raw hash bytes.
   */
  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  /**
   * Returns the imprint of the hash, which includes the algorithm identifier and the data.
   * The first two bytes represent the algorithm, followed by the data bytes.
   * NB! Do not use this for signing, use `data` instead.
   *
   * @returns {Uint8Array} Copy of the imprint bytes.
   */
  public get imprint(): Uint8Array {
    return new Uint8Array(this._imprint);
  }

  /**
   * Reconstruct a DataHash from its imprint form (2-byte algorithm id
   * followed by the hash bytes).
   *
   * @param {Uint8Array} imprint Imprint bytes; must be at least 3 bytes long.
   * @returns {DataHash} Decoded hash.
   * @throws {HashError} If the imprint is too short.
   */
  public static fromImprint(imprint: Uint8Array): DataHash {
    if (imprint.length < 3) {
      throw new HashError('Imprint must have 2 bytes of algorithm and at least 1 byte of data.');
    }

    const algorithm = (imprint[0] << 8) | imprint[1];
    return new DataHash(HashAlgorithm.fromId(algorithm), imprint.subarray(2));
  }

  /**
   * Equality check against another hash, comparing imprints so algorithm
   * mismatches are detected.
   *
   * @param {DataHash} hash Other hash, or `undefined`.
   * @returns {boolean} True if the hashes are equal.
   */
  public equals(hash?: DataHash): boolean {
    return areUint8ArraysEqual(this._imprint, hash?._imprint);
  }

  /**
   * @returns {string} `[algorithm]hex` representation of the hash.
   */
  public toString(): string {
    return `[${this.algorithm.toString()}]${HexConverter.encode(this._data)}`;
  }
}
