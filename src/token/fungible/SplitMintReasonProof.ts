import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import type { IMerkleSumTreePathJson } from '@unicitylabs/commons/lib/smst/MerkleSumTreePath.js';
import { MerkleSumTreePath } from '@unicitylabs/commons/lib/smst/MerkleSumTreePath.js';
import type { IMerkleTreePathJson } from '@unicitylabs/commons/lib/smt/MerkleTreePath.js';
import { MerkleTreePath } from '@unicitylabs/commons/lib/smt/MerkleTreePath.js';

export interface ISplitMintReasonProofJson {
  readonly aggregationPath: IMerkleTreePathJson;
  readonly coinTreePath: IMerkleSumTreePathJson;
}

export class SplitMintReasonProof {
  public constructor(
    public readonly aggregationPath: MerkleTreePath,
    public readonly coinTreePath: MerkleSumTreePath,
  ) {}

  public toJSON(): ISplitMintReasonProofJson {
    return {
      aggregationPath: this.aggregationPath.toJSON(),
      coinTreePath: this.coinTreePath.toJSON(),
    };
  }

  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([this.aggregationPath.toCBOR(), this.coinTreePath.toCBOR()]);
  }
}
