import { bitLen } from '@noble/curves/utils.js';

import { ISparseMerkleSumTreePathStepJson, SparseMerkleSumTreePathStep } from './SparseMerkleSumTreePathStep.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { DataHasher } from '../../crypto/hash/DataHasher.js';
import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';
import { BigintConverter } from '../../serialization/BigintConverter.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { dedent } from '../../util/StringUtils.js';
import { PathVerificationResult } from '../PathVerificationResult.js';

export interface ISparseMerkleSumTreePathJson {
  readonly root: string;
  readonly steps: ReadonlyArray<ISparseMerkleSumTreePathStepJson>;
}

export class SparseMerkleSumTreePath {
  public constructor(
    public readonly root: DataHash,
    public readonly steps: ReadonlyArray<SparseMerkleSumTreePathStep>,
  ) {}

  public static fromCBOR(bytes: Uint8Array): SparseMerkleSumTreePath {
    const data = CborDeserializer.decodeArray(bytes);
    const steps = CborDeserializer.decodeArray(data[1]);

    return new SparseMerkleSumTreePath(
      DataHash.fromCBOR(data[0]),
      steps.map((step) => SparseMerkleSumTreePathStep.fromCBOR(step)),
    );
  }

  public static fromJSON(data: unknown): SparseMerkleSumTreePath {
    if (!SparseMerkleSumTreePath.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new SparseMerkleSumTreePath(
      DataHash.fromJSON(data.root),
      data.steps.map((step: unknown) => SparseMerkleSumTreePathStep.fromJSON(step)),
    );
  }

  public static isJSON(data: unknown): data is ISparseMerkleSumTreePathJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'root' in data &&
      typeof data.root === 'string' &&
      'steps' in data &&
      Array.isArray(data.steps) &&
      data.steps.length > 0
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

  public toString(): string {
    return dedent`
      Merkle Tree Path
        Root: ${this.root.toString()} 
        Steps: [
          ${this.steps.map((step: SparseMerkleSumTreePathStep | null) => step?.toString() ?? 'null').join('\n')}
        ]`;
  }

  /**
   * Verifies the tree path against the root hash and state ID.
   * @param stateId The state ID as bit string in bigint format to verify against the path.
   * @returns A Promise resolving to a PathVerificationResult indicating success or failure.
   */
  public async verify(stateId: bigint): Promise<PathVerificationResult> {
    let step = this.steps[0];

    let currentData: Uint8Array | null;
    let currentPath = step.path;
    let currentSum = step.value;

    if (step.path > 0) {
      const hash = await new DataHasher(this.root.algorithm)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(step.path)),
            CborSerializer.encodeNullable(step.data, CborSerializer.encodeByteString),
            CborSerializer.encodeByteString(BigintConverter.encode(step.value)),
          ),
        )
        .digest();
      currentData = hash.data;
    } else {
      currentPath = 1n;
      currentData = step.data;
    }

    for (let i = 1; i < this.steps.length; i++) {
      step = this.steps[i];
      const isRight = this.steps[i - 1].path & 1n;

      const left = {
        data: isRight ? step.data : currentData,
        value: isRight ? step.value : currentSum,
      };

      const right = {
        data: isRight ? currentData : step.data,
        value: isRight ? currentSum : step.value,
      };

      const hash = await new DataHasher(this.root.algorithm)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(step.path)),
            CborSerializer.encodeNullable(left.data, CborSerializer.encodeByteString),
            CborSerializer.encodeByteString(BigintConverter.encode(left.value)),
            CborSerializer.encodeNullable(right.data, CborSerializer.encodeByteString),
            CborSerializer.encodeByteString(BigintConverter.encode(right.value)),
          ),
        )
        .digest();

      currentData = hash.data;

      const length = BigInt(bitLen(step.path) - 1);
      if (length < 0n) {
        return new PathVerificationResult(false, false);
      }
      currentPath = (currentPath << length) | (step.path & ((1n << length) - 1n));
      currentSum += step.value;
    }

    const pathValid = currentData != null && this.root.equals(new DataHash(this.root.algorithm, currentData));
    const pathIncluded = stateId === currentPath;

    return new PathVerificationResult(pathValid, pathIncluded);
  }
}
