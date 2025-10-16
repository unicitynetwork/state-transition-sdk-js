import { ISparseMerkleSumTreePathStepJson, SparseMerkleSumTreePathStep } from './SparseMerkleSumTreePathStep.js';
import { DataHash } from '../../hash/DataHash.js';
import { DataHasher } from '../../hash/DataHasher.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { PathVerificationResult } from '../plain/PathVerificationResult.js';

interface IRootJson {
  readonly hash: string;
  readonly counter: string;
}

export class SparseMerkleSumTreePathRoot {
  public constructor(
    public readonly hash: DataHash,
    public readonly counter: bigint,
  ) {}

  public static isJSON(data: unknown): data is IRootJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'hash' in data &&
      typeof data.hash === 'string' &&
      'counter' in data &&
      typeof data.hash === 'string'
    );
  }

  public static fromJSON(data: unknown): SparseMerkleSumTreePathRoot {
    if (!SparseMerkleSumTreePathRoot.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new SparseMerkleSumTreePathRoot(DataHash.fromJSON(data.hash), BigInt(data.counter));
  }

  public static fromCBOR(bytes: Uint8Array): SparseMerkleSumTreePathRoot {
    const data = CborDeserializer.readArray(bytes);

    return new SparseMerkleSumTreePathRoot(
      DataHash.fromCBOR(data[0]),
      BigintConverter.decode(CborDeserializer.readByteString(data[1])),
    );
  }

  public toJSON(): IRootJson {
    return {
      counter: this.counter.toString(),
      hash: this.hash.toJSON(),
    };
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.hash.toCBOR(),
      CborSerializer.encodeByteString(BigintConverter.encode(this.counter)),
    );
  }
}

export interface ISparseMerkleSumTreePathJson {
  readonly root: IRootJson;
  readonly steps: ReadonlyArray<ISparseMerkleSumTreePathStepJson>;
}

export class SparseMerkleSumTreePath {
  public constructor(
    public readonly root: SparseMerkleSumTreePathRoot,
    public readonly steps: ReadonlyArray<SparseMerkleSumTreePathStep>,
  ) {}

  public static fromJSON(data: unknown): SparseMerkleSumTreePath {
    if (!SparseMerkleSumTreePath.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new SparseMerkleSumTreePath(
      SparseMerkleSumTreePathRoot.fromJSON(data.root),
      data.steps.map((step: unknown) => SparseMerkleSumTreePathStep.fromJSON(step)),
    );
  }

  public static isJSON(data: unknown): data is ISparseMerkleSumTreePathJson {
    return typeof data === 'object' && data !== null && 'root' in data && 'steps' in data && Array.isArray(data.steps);
  }

  public static fromCBOR(bytes: Uint8Array): SparseMerkleSumTreePath {
    const data = CborDeserializer.readArray(bytes);

    return new SparseMerkleSumTreePath(
      SparseMerkleSumTreePathRoot.fromCBOR(data[0]),
      CborDeserializer.readArray(data[1]).map((step) => SparseMerkleSumTreePathStep.fromCBOR(step)),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.root.toCBOR(),
      CborSerializer.encodeArray(...this.steps.map((step) => step.toCBOR())),
    );
  }

  public toJSON(): ISparseMerkleSumTreePathJson {
    return {
      root: this.root.toJSON(),
      steps: this.steps.map((step) => step.toJSON()),
    };
  }

  /**
   * Verifies the tree path against the root hash and request ID.
   * @param requestId The request ID as bit string in bigint format to verify against the path.
   * @returns A Promise resolving to a PathVerificationResult indicating success or failure.
   */
  public async verify(requestId: bigint): Promise<PathVerificationResult> {
    let currentPath = 1n;
    let currentHash: DataHash | null = null;
    let currentCounter = this.steps.at(0)?.branch?.counter ?? 0n;

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      let hash: DataHash | null = null;
      if (step.branch !== null) {
        const bytes: Uint8Array | null = i === 0 ? step.branch.value : currentHash ? currentHash.imprint : null;
        hash = await new DataHasher(HashAlgorithm.SHA256)
          .update(
            CborSerializer.encodeArray(
              CborSerializer.encodeByteString(BigintConverter.encode(step.path)),
              bytes ? CborSerializer.encodeByteString(bytes) : CborSerializer.encodeNull(),
              CborSerializer.encodeByteString(BigintConverter.encode(currentCounter)),
            ),
          )
          .digest();

        const length = BigInt(step.path.toString(2).length - 1);
        currentPath = (currentPath << length) | (step.path & ((1n << length) - 1n));
      }

      const isRight = step.path & 1n;
      const right: [Uint8Array | null, bigint | null] | null = isRight
        ? hash
          ? [hash.imprint, currentCounter]
          : null
        : step.sibling
          ? [step.sibling.value, step.sibling.counter]
          : null;
      const left: [Uint8Array | null, bigint | null] | null = isRight
        ? step.sibling
          ? [step.sibling.value, step.sibling.counter]
          : null
        : hash
          ? [hash.imprint, currentCounter]
          : null;

      currentHash = await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborSerializer.encodeArray(
            left
              ? CborSerializer.encodeArray(
                  left[0] ? CborSerializer.encodeByteString(left[0]) : CborSerializer.encodeNull(),
                  left[1]
                    ? CborSerializer.encodeByteString(BigintConverter.encode(left[1]))
                    : CborSerializer.encodeNull(),
                )
              : CborSerializer.encodeNull(),
            right
              ? CborSerializer.encodeArray(
                  right[0] ? CborSerializer.encodeByteString(right[0]) : CborSerializer.encodeNull(),
                  right[1]
                    ? CborSerializer.encodeByteString(BigintConverter.encode(right[1]))
                    : CborSerializer.encodeNull(),
                )
              : CborSerializer.encodeNull(),
          ),
        )
        .digest();
      currentCounter += step.sibling?.counter ?? 0n;
    }

    return new PathVerificationResult(
      !!currentHash && this.root.hash.equals(currentHash) && currentCounter === this.root.counter,
      requestId === currentPath,
    );
  }

  public toString(): string {
    return dedent`
      Merkle Tree Path
        Root: ${this.root.toString()} 
        Steps: [
          ${this.steps.map((step: SparseMerkleSumTreePathStep | null) => step?.toString() ?? 'null').join('\n')}
        ]`;
  }
}
