import { Branch } from './Branch.js';
import { LeafBranch } from './LeafBranch.js';
import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

type SparseMerkleSumTreePathStepBranchJson = [string | null, string];

class SparseMerkleSumTreePathStepBranch {
  public constructor(
    public readonly counter: bigint,
    private readonly _value: Uint8Array | null,
  ) {
    this._value = _value ? new Uint8Array(_value) : null;
  }

  public get value(): Uint8Array | null {
    return this._value ? new Uint8Array(this._value) : null;
  }

  public static isJSON(data: unknown): data is SparseMerkleSumTreePathStepBranchJson {
    return Array.isArray(data);
  }

  public static fromJSON(data: unknown): SparseMerkleSumTreePathStepBranch {
    if (!Array.isArray(data)) {
      throw new InvalidJsonStructureError();
    }

    const value = data.at(0);
    const counter = data.at(1);
    return new SparseMerkleSumTreePathStepBranch(BigInt(counter ?? 0n), value ? HexConverter.decode(value) : null);
  }

  public static fromCBOR(bytes: Uint8Array): SparseMerkleSumTreePathStepBranch {
    const data = CborDeserializer.readArray(bytes);

    return new SparseMerkleSumTreePathStepBranch(
      BigintConverter.decode(CborDeserializer.readByteString(data[0])),
      CborDeserializer.readOptional(data[1], CborDeserializer.readByteString),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(BigintConverter.encode(this.counter)),
      CborSerializer.encodeOptional(this._value, CborSerializer.encodeByteString),
    );
  }

  public toJSON(): SparseMerkleSumTreePathStepBranchJson {
    return [this._value ? HexConverter.encode(this._value) : null, this.counter.toString()];
  }

  public toString(): string {
    return `MerkleSumTreePathStepBranch[${this._value ? HexConverter.encode(this._value) : 'null'}, ${this.counter}]`;
  }
}

export interface ISparseMerkleSumTreePathStepJson {
  readonly path: string;
  readonly sibling: SparseMerkleSumTreePathStepBranchJson | null;
  readonly branch: SparseMerkleSumTreePathStepBranchJson | null;
}

export class SparseMerkleSumTreePathStep {
  private constructor(
    public readonly path: bigint,
    public readonly sibling: SparseMerkleSumTreePathStepBranch | null,
    public readonly branch: SparseMerkleSumTreePathStepBranch | null,
  ) {}

  public static createWithoutBranch(path: bigint, sibling: Branch | null): SparseMerkleSumTreePathStep {
    return new SparseMerkleSumTreePathStep(
      path,
      sibling ? new SparseMerkleSumTreePathStepBranch(sibling.sum, sibling.hash.imprint) : null,
      null,
    );
  }

  public static create(path: bigint, value: Branch | null, sibling: Branch | null): SparseMerkleSumTreePathStep {
    if (value == null) {
      return new SparseMerkleSumTreePathStep(
        path,
        sibling ? new SparseMerkleSumTreePathStepBranch(sibling.sum, sibling.hash.imprint) : null,
        new SparseMerkleSumTreePathStepBranch(0n, null),
      );
    }

    if (value instanceof LeafBranch) {
      return new SparseMerkleSumTreePathStep(
        path,
        sibling ? new SparseMerkleSumTreePathStepBranch(sibling.sum, sibling.hash.imprint) : null,
        new SparseMerkleSumTreePathStepBranch(value.sum, value.value),
      );
    }

    return new SparseMerkleSumTreePathStep(
      path,
      sibling ? new SparseMerkleSumTreePathStepBranch(sibling.sum, sibling.hash.imprint) : null,
      new SparseMerkleSumTreePathStepBranch(value.sum, value.childrenHash.data),
    );
  }

  public static isJSON(data: unknown): data is ISparseMerkleSumTreePathStepJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'path' in data &&
      typeof data.path === 'string' &&
      'sibling' in data &&
      'branch' in data
    );
  }

  public static fromJSON(data: unknown): SparseMerkleSumTreePathStep {
    if (!SparseMerkleSumTreePathStep.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new SparseMerkleSumTreePathStep(
      BigInt(data.path),
      data.sibling != null ? SparseMerkleSumTreePathStepBranch.fromJSON(data.sibling) : null,
      data.branch != null ? SparseMerkleSumTreePathStepBranch.fromJSON(data.branch) : null,
    );
  }

  public static fromCBOR(bytes: Uint8Array): SparseMerkleSumTreePathStep {
    const data = CborDeserializer.readArray(bytes);

    return new SparseMerkleSumTreePathStep(
      BigintConverter.decode(CborDeserializer.readByteString(data[0])),
      CborDeserializer.readOptional(data[1], SparseMerkleSumTreePathStepBranch.fromCBOR),
      CborDeserializer.readOptional(data[2], SparseMerkleSumTreePathStepBranch.fromCBOR),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
      this.sibling?.toCBOR() ?? CborSerializer.encodeNull(),
      this.branch?.toCBOR() ?? CborSerializer.encodeNull(),
    );
  }

  public toJSON(): ISparseMerkleSumTreePathStepJson {
    return {
      branch: this.branch?.toJSON() ?? null,
      path: this.path.toString(),
      sibling: this.sibling?.toJSON() ?? null,
    };
  }

  public toString(): string {
    return dedent`
      Merkle Tree Path Step
        Path: ${this.path.toString(2)}
        Branch: ${this.branch?.toString() ?? 'null'}
        Sibling: ${this.sibling?.toString() ?? 'null'}`;
  }
}
