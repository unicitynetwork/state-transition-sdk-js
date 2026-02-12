import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';
import { BigintConverter } from '../../serialization/BigintConverter.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../serialization/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

export interface ISparseMerkleSumTreePathStepJson {
  readonly data: string | null;
  readonly path: string;
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

  public static fromCBOR(bytes: Uint8Array): SparseMerkleSumTreePathStep {
    const data = CborDeserializer.decodeArray(bytes);

    return new SparseMerkleSumTreePathStep(
      BigintConverter.decode(CborDeserializer.decodeByteString(data[0])),
      CborDeserializer.decodeNullable(data[1], CborDeserializer.decodeByteString),
      BigintConverter.decode(CborDeserializer.decodeByteString(data[2])),
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

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
      CborSerializer.encodeNullable(this._data, CborSerializer.encodeByteString),
      CborSerializer.encodeByteString(BigintConverter.encode(this.value)),
    );
  }

  public toString(): string {
    return dedent`
      Merkle Tree Path Step
        Path: ${this.path.toString(2)}
        Data: ${this._data ? HexConverter.encode(this._data) : 'null'}
        Value: ${this.value}`;
  }
}
