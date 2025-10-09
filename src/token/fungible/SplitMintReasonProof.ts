import { IMerkleTreePathJson, MerkleTreePath } from '../../mtree/plain/MerkleTreePath.js';
import { IMerkleSumTreePathJson, MerkleSumTreePath } from '../../mtree/sum/MerkleSumTreePath.js';
import { CborEncoder } from '../../serializer/cbor/CborEncoder.js';

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
