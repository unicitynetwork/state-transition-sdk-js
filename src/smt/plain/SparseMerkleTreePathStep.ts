import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

/**
 * Single step along a plain sparse Merkle tree path.
 */
export class SparseMerkleTreePathStep {
  public constructor(
    public readonly path: bigint,
    private readonly _data: Uint8Array | null,
  ) {
    if (path < 0n) {
      throw new Error('Path should be non negative.');
    }
  }

  /**
   * @returns {Uint8Array|null} Copy of the step data bytes, or `null`.
   */
  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

  /**
   * Create SparseMerkleTreePathStep from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @returns {SparseMerkleTreePathStep} Decoded step.
   */
  public static fromCBOR(bytes: Uint8Array): SparseMerkleTreePathStep {
    const data = CborDeserializer.decodeArray(bytes, 2);

    return new SparseMerkleTreePathStep(
      BigintConverter.decode(CborDeserializer.decodeByteString(data[0])),
      CborDeserializer.decodeNullable(data[1], CborDeserializer.decodeByteString),
    );
  }

  /**
   * Convert SparseMerkleTreePathStep to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
      CborSerializer.encodeNullable(this._data, CborSerializer.encodeByteString),
    );
  }

  /**
   * @returns {string} String representation of the step.
   */
  public toString(): string {
    return dedent`
      Merkle Tree Path Step
        Path: ${this.path.toString(2)}
        Data: ${this._data ? HexConverter.encode(this._data) : 'null'}`;
  }
}
