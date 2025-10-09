import { Branch } from './Branch.js';
import { LeafBranch } from './LeafBranch.js';
import { CborDecoder } from '../../serializer/cbor/CborDecoder.js';
import { CborEncoder } from '../../serializer/cbor/CborEncoder.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { HexConverter } from '../../util/HexConverter.js';
import { dedent } from '../../util/StringUtils.js';

type MerkleSumTreePathStepBranchJson = [string, string | null];

class MerkleSumTreePathStepBranch {
  public constructor(
    public readonly sum: bigint,
    private readonly _value: Uint8Array | null,
  ) {
    this._value = _value ? new Uint8Array(_value) : null;
  }

  public get value(): Uint8Array | null {
    return this._value ? new Uint8Array(this._value) : null;
  }

  public static isJSON(data: unknown): data is MerkleSumTreePathStepBranchJson {
    return Array.isArray(data);
  }

  public static fromJSON(data: unknown): MerkleSumTreePathStepBranch {
    if (!Array.isArray(data)) {
      throw new Error('Parsing merkle tree path step branch failed.');
    }

    const sum = data.at(0);
    const value = data.at(1);
    return new MerkleSumTreePathStepBranch(BigInt(sum ?? 0n), value ? HexConverter.decode(value) : null);
  }

  public static fromCBOR(bytes: Uint8Array): MerkleSumTreePathStepBranch {
    const data = CborDecoder.readArray(bytes);

    return new MerkleSumTreePathStepBranch(
      BigintConverter.decode(CborDecoder.readByteString(data[0])),
      CborDecoder.readOptional(data[1], CborDecoder.readByteString),
    );
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      CborEncoder.encodeByteString(BigintConverter.encode(this.sum)),
      CborEncoder.encodeOptional(this._value, CborEncoder.encodeByteString),
    ]);
  }

  public toJSON(): MerkleSumTreePathStepBranchJson {
    return [this.sum.toString(), this._value ? HexConverter.encode(this._value) : null];
  }

  public toString(): string {
    return `MerkleSumTreePathStepBranch[${this._value ? HexConverter.encode(this._value) : 'null'}]`;
  }
}

export interface IMerkleSumTreePathStepJson {
  readonly path: string;
  readonly sibling: MerkleSumTreePathStepBranchJson | null;
  readonly branch: MerkleSumTreePathStepBranchJson | null;
}

export class MerkleSumTreePathStep {
  private constructor(
    public readonly path: bigint,
    public readonly sibling: MerkleSumTreePathStepBranch | null,
    public readonly branch: MerkleSumTreePathStepBranch | null,
  ) {}

  public static createWithoutBranch(path: bigint, sibling: Branch | null): MerkleSumTreePathStep {
    return new MerkleSumTreePathStep(
      path,
      sibling ? new MerkleSumTreePathStepBranch(sibling.sum, sibling.hash.imprint) : null,
      null,
    );
  }

  public static create(path: bigint, value: Branch | null, sibling: Branch | null): MerkleSumTreePathStep {
    if (value == null) {
      return new MerkleSumTreePathStep(
        path,
        sibling ? new MerkleSumTreePathStepBranch(sibling.sum, sibling.hash.imprint) : null,
        new MerkleSumTreePathStepBranch(0n, null),
      );
    }

    if (value instanceof LeafBranch) {
      return new MerkleSumTreePathStep(
        path,
        sibling ? new MerkleSumTreePathStepBranch(sibling.sum, sibling.hash.imprint) : null,
        new MerkleSumTreePathStepBranch(value.sum, value.value),
      );
    }

    return new MerkleSumTreePathStep(
      path,
      sibling ? new MerkleSumTreePathStepBranch(sibling.sum, sibling.hash.imprint) : null,
      new MerkleSumTreePathStepBranch(value.sum, value.childrenHash.data),
    );
  }

  public static isJSON(data: unknown): data is IMerkleSumTreePathStepJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'path' in data &&
      typeof data.path === 'string' &&
      'sibling' in data &&
      'branch' in data
    );
  }

  public static fromJSON(data: unknown): MerkleSumTreePathStep {
    if (!MerkleSumTreePathStep.isJSON(data)) {
      throw new Error('Parsing merkle tree path step failed.');
    }

    return new MerkleSumTreePathStep(
      BigInt(data.path),
      data.sibling != null ? MerkleSumTreePathStepBranch.fromJSON(data.sibling) : null,
      data.branch != null ? MerkleSumTreePathStepBranch.fromJSON(data.branch) : null,
    );
  }

  public static fromCBOR(bytes: Uint8Array): MerkleSumTreePathStep {
    const data = CborDecoder.readArray(bytes);

    return new MerkleSumTreePathStep(
      BigintConverter.decode(CborDecoder.readByteString(data[0])),
      CborDecoder.readOptional(data[1], MerkleSumTreePathStepBranch.fromCBOR),
      CborDecoder.readOptional(data[2], MerkleSumTreePathStepBranch.fromCBOR),
    );
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      CborEncoder.encodeByteString(BigintConverter.encode(this.path)),
      this.sibling?.toCBOR() ?? CborEncoder.encodeNull(),
      this.branch?.toCBOR() ?? CborEncoder.encodeNull(),
    ]);
  }

  public toJSON(): IMerkleSumTreePathStepJson {
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
