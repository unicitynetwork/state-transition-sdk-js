import { AssetId } from './asset/AssetId.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { SparseMerkleTreePath } from '../smt/plain/SparseMerkleTreePath.js';
import { SparseMerkleSumTreePath } from '../smt/sum/SparseMerkleSumTreePath.js';

export class SplitReasonProof {
  private constructor(
    public readonly assetId: AssetId,
    public readonly aggregationPath: SparseMerkleTreePath,
    public readonly coinTreePath: SparseMerkleSumTreePath,
  ) {}

  public static create(
    assetId: AssetId,
    aggregationPath: SparseMerkleTreePath,
    coinTreePath: SparseMerkleSumTreePath,
  ): SplitReasonProof {
    return new SplitReasonProof(assetId, aggregationPath, coinTreePath);
  }

  /**
   * Create split mint reason from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return split mint reason proof
   */
  public static fromCBOR(bytes: Uint8Array): SplitReasonProof {
    const data = CborDeserializer.decodeArray(bytes);

    return new SplitReasonProof(
      AssetId.fromCBOR(data[0]),
      SparseMerkleTreePath.fromCBOR(data[1]),
      SparseMerkleSumTreePath.fromCBOR(data[2]),
    );
  }

  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.assetId.toCBOR(), this.aggregationPath.toCBOR(), this.coinTreePath.toCBOR());
  }
}
