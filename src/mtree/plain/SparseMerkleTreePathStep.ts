import { Branch } from './Branch.js';
import { LeafBranch } from './LeafBranch.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

type SparseMerkleTreePathStepBranchJson = [string?];

class SparseMerkleTreePathStepBranch {
  public constructor(private readonly _value: Uint8Array | null) {
    this._value = _value ? new Uint8Array(_value) : null;
  }

  public get value(): Uint8Array | null {
    return this._value ? new Uint8Array(this._value) : null;
  }

  public static isJSON(data: unknown): data is SparseMerkleTreePathStepBranchJson {
    return Array.isArray(data);
  }

  public static fromJSON(data: unknown): SparseMerkleTreePathStepBranch {
    if (!Array.isArray(data)) {
      throw new Error('Parsing merkle tree path step branch failed.');
    }

    const value = data.at(0);
    return new SparseMerkleTreePathStepBranch(value ? HexConverter.decode(value) : null);
  }

  public static fromCBOR(bytes: Uint8Array): SparseMerkleTreePathStepBranch {
    const data = CborDeserializer.readArray(bytes);

    return new SparseMerkleTreePathStepBranch(CborDeserializer.readOptional(data[0], CborDeserializer.readByteString));
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(CborSerializer.encodeOptional(this._value, CborSerializer.encodeByteString));
  }

  public toJSON(): SparseMerkleTreePathStepBranchJson {
    return this._value ? [HexConverter.encode(this._value)] : [];
  }

  public toString(): string {
    return `MerkleTreePathStepBranch[${this._value ? HexConverter.encode(this._value) : 'null'}]`;
  }
}

export interface ISparseMerkleTreePathStepJson {
  readonly path: string;
  readonly sibling: SparseMerkleTreePathStepBranchJson | null;
  readonly branch: SparseMerkleTreePathStepBranchJson | null;
}

export class SparseMerkleTreePathStep {
  private constructor(
    public readonly path: bigint,
    public readonly sibling: SparseMerkleTreePathStepBranch | null,
    public readonly branch: SparseMerkleTreePathStepBranch | null,
  ) {}

  public static createWithoutBranch(path: bigint, sibling: Branch | null): SparseMerkleTreePathStep {
    return new SparseMerkleTreePathStep(path, sibling ? new SparseMerkleTreePathStepBranch(sibling.hash.data) : null, null);
  }

  public static create(path: bigint, value: Branch | null, sibling: Branch | null): SparseMerkleTreePathStep {
    if (value == null) {
      return new SparseMerkleTreePathStep(
        path,
        sibling ? new SparseMerkleTreePathStepBranch(sibling.hash.data) : null,
        new SparseMerkleTreePathStepBranch(null),
      );
    }

    if (value instanceof LeafBranch) {
      return new SparseMerkleTreePathStep(
        path,
        sibling ? new SparseMerkleTreePathStepBranch(sibling.hash.data) : null,
        new SparseMerkleTreePathStepBranch(value.value),
      );
    }

    return new SparseMerkleTreePathStep(
      path,
      sibling ? new SparseMerkleTreePathStepBranch(sibling.hash.data) : null,
      new SparseMerkleTreePathStepBranch(value.childrenHash.data),
    );
  }

  public static isJSON(data: unknown): data is ISparseMerkleTreePathStepJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'path' in data &&
      typeof data.path === 'string' &&
      'sibling' in data &&
      'branch' in data
    );
  }

  public static fromJSON(data: unknown): SparseMerkleTreePathStep {
    if (!SparseMerkleTreePathStep.isJSON(data)) {
      throw new Error('Parsing merkle tree path step failed.');
    }

    return new SparseMerkleTreePathStep(
      BigInt(data.path),
      data.sibling ? SparseMerkleTreePathStepBranch.fromJSON(data.sibling) : null,
      data.branch != null ? SparseMerkleTreePathStepBranch.fromJSON(data.branch) : null,
    );
  }

  public static fromCBOR(bytes: Uint8Array): SparseMerkleTreePathStep {
    const data = CborDeserializer.readArray(bytes);

    return new SparseMerkleTreePathStep(
      BigintConverter.decode(CborDeserializer.readByteString(data[0])),
      CborDeserializer.readOptional(data[1], SparseMerkleTreePathStepBranch.fromCBOR),
      CborDeserializer.readOptional(data[2], SparseMerkleTreePathStepBranch.fromCBOR),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(BigintConverter.encode(this.path)),
      this.sibling?.toCBOR() ?? CborSerializer.encodeNull(),
      this.branch?.toCBOR() ?? CborSerializer.encodeNull(),
    );
  }

  public toJSON(): ISparseMerkleTreePathStepJson {
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
