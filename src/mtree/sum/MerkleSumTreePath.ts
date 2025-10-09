import { IMerkleSumTreePathStepJson, MerkleSumTreePathStep } from './MerkleSumTreePathStep.js';
import { DataHash } from '../../hash/DataHash.js';
import { DataHasher } from '../../hash/DataHasher.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { CborDecoder } from '../../serializer/cbor/CborDecoder.js';
import { CborEncoder } from '../../serializer/cbor/CborEncoder.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { dedent } from '../../util/StringUtils.js';
import { PathVerificationResult } from '../plain/PathVerificationResult.js';

export interface IMerkleSumTreePathJson {
  readonly root: string;
  readonly sum: string;
  readonly steps: ReadonlyArray<IMerkleSumTreePathStepJson>;
}

export class MerkleSumTreePath {
  public constructor(
    public readonly root: DataHash,
    public readonly sum: bigint,
    public readonly steps: ReadonlyArray<MerkleSumTreePathStep>,
  ) {}

  public static fromJSON(data: unknown): MerkleSumTreePath {
    if (!MerkleSumTreePath.isJSON(data)) {
      throw new Error('Parsing merkle tree path json failed.');
    }

    return new MerkleSumTreePath(
      DataHash.fromJSON(data.root),
      BigInt(data.sum),
      data.steps.map((step: unknown) => MerkleSumTreePathStep.fromJSON(step)),
    );
  }

  public static isJSON(data: unknown): data is IMerkleSumTreePathJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'root' in data &&
      typeof data.root === 'string' &&
      'steps' in data &&
      Array.isArray(data.steps)
    );
  }

  public static fromCBOR(bytes: Uint8Array): MerkleSumTreePath {
    const data = CborDecoder.readArray(bytes);

    return new MerkleSumTreePath(
      DataHash.fromCBOR(data[0]),
      BigintConverter.decode(CborDecoder.readByteString(data[1])),
      CborDecoder.readArray(data[2]).map((step) => MerkleSumTreePathStep.fromCBOR(step)),
    );
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      this.root.toCBOR(),
      CborEncoder.encodeByteString(BigintConverter.encode(this.sum)),
      CborEncoder.encodeArray(this.steps.map((step) => step.toCBOR())),
    ]);
  }

  public toJSON(): IMerkleSumTreePathJson {
    return {
      root: this.root.toJSON(),
      steps: this.steps.map((step) => step.toJSON()),
      sum: this.sum.toString(),
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
    let currentSum = this.steps.at(0)?.branch?.sum ?? 0n;

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      let hash: DataHash | null = null;
      if (step.branch !== null) {
        const bytes: Uint8Array | null = i === 0 ? step.branch.value : currentHash ? currentHash.imprint : null;
        hash = await new DataHasher(HashAlgorithm.SHA256)
          .update(
            CborEncoder.encodeArray([
              CborEncoder.encodeByteString(BigintConverter.encode(step.path)),
              bytes ? CborEncoder.encodeByteString(bytes) : CborEncoder.encodeNull(),
              CborEncoder.encodeByteString(BigintConverter.encode(currentSum)),
            ]),
          )
          .digest();

        const length = BigInt(step.path.toString(2).length - 1);
        currentPath = (currentPath << length) | (step.path & ((1n << length) - 1n));
      }

      const isRight = step.path & 1n;
      const right: [Uint8Array | null, bigint | null] | null = isRight
        ? hash
          ? [hash.imprint, currentSum]
          : null
        : step.sibling
          ? [step.sibling.value, step.sibling.sum]
          : null;
      const left: [Uint8Array | null, bigint | null] | null = isRight
        ? step.sibling
          ? [step.sibling.value, step.sibling.sum]
          : null
        : hash
          ? [hash.imprint, currentSum]
          : null;

      currentHash = await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborEncoder.encodeArray([
            left
              ? CborEncoder.encodeArray([
                  left[0] ? CborEncoder.encodeByteString(left[0]) : CborEncoder.encodeNull(),
                  left[1] ? CborEncoder.encodeByteString(BigintConverter.encode(left[1])) : CborEncoder.encodeNull(),
                ])
              : CborEncoder.encodeNull(),
            right
              ? CborEncoder.encodeArray([
                  right[0] ? CborEncoder.encodeByteString(right[0]) : CborEncoder.encodeNull(),
                  right[1] ? CborEncoder.encodeByteString(BigintConverter.encode(right[1])) : CborEncoder.encodeNull(),
                ])
              : CborEncoder.encodeNull(),
          ]),
        )
        .digest();
      currentSum += step.sibling?.sum ?? 0n;
    }

    return new PathVerificationResult(
      !!currentHash && this.root.equals(currentHash) && currentSum === this.sum,
      requestId === currentPath,
    );
  }

  public toString(): string {
    return dedent`
      Merkle Tree Path
        Root: ${this.root.toString()} 
        Steps: [
          ${this.steps.map((step: MerkleSumTreePathStep | null) => step?.toString() ?? 'null').join('\n')}
        ]`;
  }
}
