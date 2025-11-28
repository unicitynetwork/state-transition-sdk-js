import { bitLen } from '@noble/curves/utils.js';

import { PathVerificationResult } from '../PathVerificationResult.js';
import { ISparseMerkleTreePathStepJson, SparseMerkleTreePathStep } from './SparseMerkleTreePathStep.js';
import { DataHash } from '../../hash/DataHash.js';
import { DataHasher } from '../../hash/DataHasher.js';
import { InvalidJsonStructureError } from '../../InvalidJsonStructureError.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { dedent } from '../../util/StringUtils.js';

export interface ISparseMerkleTreePathJson {
  readonly root: string;
  readonly steps: ReadonlyArray<ISparseMerkleTreePathStepJson>;
}

export class SparseMerkleTreePath {
  public constructor(
    public readonly root: DataHash,
    public readonly steps: ReadonlyArray<SparseMerkleTreePathStep>,
  ) {}

  public static fromJSON(data: unknown): SparseMerkleTreePath {
    if (!SparseMerkleTreePath.isJSON(data)) {
      throw new InvalidJsonStructureError();
    }

    return new SparseMerkleTreePath(
      DataHash.fromJSON(data.root),
      data.steps.map((step: unknown) => SparseMerkleTreePathStep.fromJSON(step)),
    );
  }

  public static isJSON(data: unknown): data is ISparseMerkleTreePathJson {
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

  public static fromCBOR(bytes: Uint8Array): SparseMerkleTreePath {
    const data = CborDeserializer.readArray(bytes);
    const steps = CborDeserializer.readArray(data[1]);

    return new SparseMerkleTreePath(
      DataHash.fromCBOR(data[0]),
      steps.map((step) => SparseMerkleTreePathStep.fromCBOR(step)),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.root.toCBOR(),
      CborSerializer.encodeArray(...this.steps.map((step: SparseMerkleTreePathStep) => step.toCBOR())),
    );
  }

  public toJSON(): ISparseMerkleTreePathJson {
    return {
      root: this.root.toJSON(),
      steps: this.steps.map((step) => step.toJSON()),
    };
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
    if (step.path > 1n) {
      const hash = await new DataHasher(this.root.algorithm)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(step.path)),
            CborSerializer.encodeOptional(step.data, CborSerializer.encodeByteString),
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

      const left = isRight ? step.data : currentData;
      const right = isRight ? currentData : step.data;

      const hash = await new DataHasher(this.root.algorithm)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(step.path)),
            CborSerializer.encodeOptional(left, CborSerializer.encodeByteString),
            CborSerializer.encodeOptional(right, CborSerializer.encodeByteString),
          ),
        )
        .digest();

      currentData = hash.data;

      const length = BigInt(bitLen(step.path) - 1);
      if (length < 0n) {
        return new PathVerificationResult(false, false);
      }
      currentPath = (currentPath << length) | (step.path & ((1n << length) - 1n));
    }

    const pathValid = currentData != null && this.root.equals(new DataHash(this.root.algorithm, currentData));
    const pathIncluded = stateId === currentPath;

    return new PathVerificationResult(pathValid, pathIncluded);
  }

  public toString(): string {
    return dedent`
      Merkle Tree Path
        Root: ${this.root.toString()} 
        Steps: [
          ${this.steps.map((step: SparseMerkleTreePathStep | null) => step?.toString() ?? 'null').join('\n')}
        ]`;
  }
}
