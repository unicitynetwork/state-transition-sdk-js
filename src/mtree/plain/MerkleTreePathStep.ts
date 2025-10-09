import { Branch } from './Branch.js';
import { LeafBranch } from './LeafBranch.js';
import { CborDecoder } from '../../serializer/cbor/CborDecoder.js';
import { CborEncoder } from '../../serializer/cbor/CborEncoder.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

type MerkleTreePathStepBranchJson = [string?];
class MerkleTreePathStepBranch {
  public constructor(private readonly _value: Uint8Array | null) {
    this._value = _value ? new Uint8Array(_value) : null;
  }

  public get value(): Uint8Array | null {
    return this._value ? new Uint8Array(this._value) : null;
  }

  public static isJSON(data: unknown): data is MerkleTreePathStepBranchJson {
    return Array.isArray(data);
  }

  public static fromJSON(data: unknown): MerkleTreePathStepBranch {
    if (!Array.isArray(data)) {
      throw new Error('Parsing merkle tree path step branch failed.');
    }

    const value = data.at(0);
    return new MerkleTreePathStepBranch(value ? HexConverter.decode(value) : null);
  }

  public static fromCBOR(bytes: Uint8Array): MerkleTreePathStepBranch {
    const data = CborDecoder.readArray(bytes);

    return new MerkleTreePathStepBranch(CborDecoder.readOptional(data[0], CborDecoder.readByteString));
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([CborEncoder.encodeOptional(this._value, CborEncoder.encodeByteString)]);
  }

  public toJSON(): MerkleTreePathStepBranchJson {
    return this._value ? [HexConverter.encode(this._value)] : [];
  }

  public toString(): string {
    return `MerkleTreePathStepBranch[${this._value ? HexConverter.encode(this._value) : 'null'}]`;
  }
}

export interface IMerkleTreePathStepJson {
  readonly path: string;
  readonly sibling: MerkleTreePathStepBranchJson | null;
  readonly branch: MerkleTreePathStepBranchJson | null;
}

export class MerkleTreePathStep {
  private constructor(
    public readonly path: bigint,
    public readonly sibling: MerkleTreePathStepBranch | null,
    public readonly branch: MerkleTreePathStepBranch | null,
  ) {}

  public static createWithoutBranch(path: bigint, sibling: Branch | null): MerkleTreePathStep {
    return new MerkleTreePathStep(path, sibling ? new MerkleTreePathStepBranch(sibling.hash.data) : null, null);
  }

  public static create(path: bigint, value: Branch | null, sibling: Branch | null): MerkleTreePathStep {
    if (value == null) {
      return new MerkleTreePathStep(
        path,
        sibling ? new MerkleTreePathStepBranch(sibling.hash.data) : null,
        new MerkleTreePathStepBranch(null),
      );
    }

    if (value instanceof LeafBranch) {
      return new MerkleTreePathStep(
        path,
        sibling ? new MerkleTreePathStepBranch(sibling.hash.data) : null,
        new MerkleTreePathStepBranch(value.value),
      );
    }

    return new MerkleTreePathStep(
      path,
      sibling ? new MerkleTreePathStepBranch(sibling.hash.data) : null,
      new MerkleTreePathStepBranch(value.childrenHash.data),
    );
  }

  public static isJSON(data: unknown): data is IMerkleTreePathStepJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'path' in data &&
      typeof data.path === 'string' &&
      'sibling' in data &&
      'branch' in data
    );
  }

  public static fromJSON(data: unknown): MerkleTreePathStep {
    if (!MerkleTreePathStep.isJSON(data)) {
      throw new Error('Parsing merkle tree path step failed.');
    }

    return new MerkleTreePathStep(
      BigInt(data.path),
      data.sibling ? MerkleTreePathStepBranch.fromJSON(data.sibling) : null,
      data.branch != null ? MerkleTreePathStepBranch.fromJSON(data.branch) : null,
    );
  }

  public static fromCBOR(bytes: Uint8Array): MerkleTreePathStep {
    const data = CborDecoder.readArray(bytes);

    return new MerkleTreePathStep(
      BigintConverter.decode(CborDecoder.readByteString(data[0])),
      CborDecoder.readOptional(data[1], MerkleTreePathStepBranch.fromCBOR),
      CborDecoder.readOptional(data[2], MerkleTreePathStepBranch.fromCBOR),
    );
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      CborEncoder.encodeByteString(BigintConverter.encode(this.path)),
      this.sibling?.toCBOR() ?? CborEncoder.encodeNull(),
      this.branch?.toCBOR() ?? CborEncoder.encodeNull(),
    ]);
  }

  public toJSON(): IMerkleTreePathStepJson {
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
