import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

export interface ISparseMerkleSumTreePathStepJson {
  readonly path: string;
  readonly data: string | null;
  readonly value: string;
}

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

  public get data(): Uint8Array | null {
    return this._data ? new Uint8Array(this._data) : null;
  }

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

  public static fromCBOR(bytes: Uint8Array): SparseMerkleSumTreePathStep {
    const data = CborDeserializer.readArray(bytes);

    return new SparseMerkleSumTreePathStep(
      BigintConverter.decode(CborDeserializer.readByteString(data[0])),
      CborDeserializer.readOptional(data[1], CborDeserializer.readByteString),
      BigintConverter.decode(CborDeserializer.readByteString(data[2])),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
      CborSerializer.encodeOptional(this._data, CborSerializer.encodeByteString),
      CborSerializer.encodeByteString(BigintConverter.encode(this.value)),
    );
  }

  public toJSON(): ISparseMerkleSumTreePathStepJson {
    return {
      data: this._data ? HexConverter.encode(this._data) : null,
      path: this.path.toString(),
      value: this.value.toString(),
    };
  }

  public toString(): string {
    return dedent`
      Merkle Tree Path Step
        Path: ${this.path.toString(2)}
        Data: ${this._data ? HexConverter.encode(this._data) : 'null'}
        Value: ${this.value}`;
  }
}
