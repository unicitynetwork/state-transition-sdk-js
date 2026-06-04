import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * JSON shape of a {@link SparseMerkleSumTreePathStep}.
 */
export interface ISparseMerkleSumTreePathStepJson {
  readonly data: string | null;
  readonly path: string;
  readonly value: string;
}

/**
 * Single step along a sparse Merkle sum tree path.
 */
export class SparseMerkleSumTreePathStep {
  public constructor(
    public readonly path: bigint,
    private readonly _data: Uint8Array | null,
    public readonly value: bigint,
  ) {
    if (path < 0n) {
      throw new Error('Path should be non negative.');
    }

    if (value < 0n) {
      throw new Error('Value must be non-negative.');
    }
  }

  /**
   * @returns {Uint8Array|null} Copy of the step data bytes, or `null`.
   */
  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

  /**
   * Create SparseMerkleSumTreePathStep from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {SparseMerkleSumTreePathStep} Decoded step.
   */
  public static fromCBOR(bytes: Uint8Array): SparseMerkleSumTreePathStep {
    const data = CborDeserializer.decodeArray(bytes, 3);

    return new SparseMerkleSumTreePathStep(
      BigintConverter.decode(CborDeserializer.decodeByteString(data[0])),
      CborDeserializer.decodeNullable(data[1], CborDeserializer.decodeByteString),
      BigintConverter.decode(CborDeserializer.decodeByteString(data[2])),
    );
  }

  /**
   * Create SparseMerkleSumTreePathStep from JSON.
   *
   * @param {unknown} data JSON object.
   * @returns {SparseMerkleSumTreePathStep} Decoded step.
   * @throws {InvalidJsonStructureError} If the JSON does not match the expected shape.
   */
  public static fromJSON(data: unknown): SparseMerkleSumTreePathStep {
    if (!SparseMerkleSumTreePathStep.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new SparseMerkleSumTreePathStep(
      BigInt(data.path),
      data.data ? HexConverter.decode(data.data) : null,
      BigInt(data.value),
    );
  }

  /**
   * Type guard for the JSON shape of a step.
   *
   * @param {unknown} data Value to test.
   * @returns {boolean} True if `data` matches {@link ISparseMerkleSumTreePathStepJson}.
   */
  public static isJSON(data: unknown): data is ISparseMerkleSumTreePathStepJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'path' in data &&
      typeof data.path === 'string' &&
      'data' in data &&
      (data.data === null || typeof data.data === 'string') &&
      'value' in data &&
      typeof data.value === 'string'
    );
  }

  /**
   * Convert SparseMerkleSumTreePathStep to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
      CborSerializer.encodeNullable(this._data, CborSerializer.encodeByteString),
      CborSerializer.encodeByteString(BigintConverter.encode(this.value)),
    );
  }

  /**
   * @returns {string} String representation of the step.
   */
  public toString(): string {
    return dedent`
      Merkle Tree Path Step
        Path: ${this.path.toString(2)}
        Data: ${this._data ? HexConverter.encode(this._data) : 'null'}
        Value: ${this.value}`;
  }
}
