import { bitLen } from '@noble/curves/utils.js';

import { PathVerificationResult } from '../PathVerificationResult.js';
import { SparseMerkleTreePathStep } from './SparseMerkleTreePathStep.js';
import { DataHash } from '../../crypto/hash/DataHash.js';
import { DataHasher } from '../../crypto/hash/DataHasher.js';
import { CborDeserializer } from '../../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serialization/cbor/CborSerializer.js';
import { BigintConverter } from '../../util/BigintConverter.js';
import { dedent } from '../../util/StringUtils.js';

export class SparseMerkleTreePath {
  public constructor(
    public readonly root: DataHash,
    public readonly steps: ReadonlyArray<SparseMerkleTreePathStep>,
  ) {}

  public static fromCBOR(bytes: Uint8Array): SparseMerkleTreePath {
    const data = CborDeserializer.decodeArray(bytes);
    const steps = CborDeserializer.decodeArray(data[1]);

    return new SparseMerkleTreePath(
      DataHash.fromImprint(CborDeserializer.decodeByteString(data[0])),
      steps.map((step) => SparseMerkleTreePathStep.fromCBOR(step)),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeByteString(this.root.imprint),
      CborSerializer.encodeArray(...this.steps.map((step: SparseMerkleTreePathStep) => step.toCBOR())),
    );
  }

  public toString(): string {
    return dedent`
      Merkle Tree Path
        Root: ${this.root.toString()} 
        Steps: [
          ${this.steps.map((step: SparseMerkleTreePathStep | null) => step?.toString() ?? 'null').join('\n')}
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
    if (step.path > 1n) {
      const hash = await new DataHasher(this.root.algorithm)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(BigintConverter.encode(step.path)),
            CborSerializer.encodeNullable(step.data, CborSerializer.encodeByteString),
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
            CborSerializer.encodeNullable(left, CborSerializer.encodeByteString),
            CborSerializer.encodeNullable(right, CborSerializer.encodeByteString),
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
}
