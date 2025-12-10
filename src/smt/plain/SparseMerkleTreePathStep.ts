import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';
import { BigintConverter } from '../../serialization/BigintConverter.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

export interface ISparseMerkleTreePathStepJson {
  readonly data: string | null;
  readonly path: string;
}

export class SparseMerkleTreePathStep {
  public constructor(
    public readonly path: bigint,
    private readonly _data: Uint8Array | null,
  ) {
    if (path < 0n) {
      throw new Error('Path should be non negative.');
    }
  }

  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

  public static fromCBOR(bytes: Uint8Array): SparseMerkleTreePathStep {
    const data = CborDeserializer.decodeArray(bytes);

    return new SparseMerkleTreePathStep(
      BigintConverter.decode(CborDeserializer.decodeByteString(data[0])),
      CborDeserializer.decodeNullable(data[1], CborDeserializer.decodeByteString),
    );
  }

  public static fromJSON(data: unknown): SparseMerkleTreePathStep {
    if (!SparseMerkleTreePathStep.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new SparseMerkleTreePathStep(BigInt(data.path), data.data ? HexConverter.decode(data.data) : null);
  }

  public static isJSON(data: unknown): data is ISparseMerkleTreePathStepJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'path' in data &&
      typeof data.path === 'string' &&
      'data' in data &&
      (data.data === null || typeof data.data === 'string')
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
      CborSerializer.encodeNullable(this._data, CborSerializer.encodeByteString),
    );
  }

  public toJSON(): ISparseMerkleTreePathStepJson {
    return {
      data: this._data ? HexConverter.encode(this._data) : null,
      path: this.path.toString(),
    };
  }

  public toString(): string {
    return dedent`
      Merkle Tree Path Step
        Path: ${this.path.toString(2)}
        Data: ${this._data ? HexConverter.encode(this._data) : 'null'}`;
  }
}
