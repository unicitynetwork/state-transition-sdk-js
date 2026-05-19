import { AssetId } from './asset/AssetId.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { SparseMerkleTreePath } from '../smt/plain/SparseMerkleTreePath.js';
import { SparseMerkleSumTreePath } from '../smt/sum/SparseMerkleSumTreePath.js';

/**
 * Inclusion proof for a single asset within a split payment.
 */
export class SplitAssetProof {
  private constructor(
    public readonly assetId: AssetId,
    public readonly aggregationPath: SparseMerkleTreePath,
    public readonly assetTreePath: SparseMerkleSumTreePath,
  ) {}

  /**
   * Create a SplitAssetProof.
   *
   * @param {AssetId} assetId Asset id.
   * @param {SparseMerkleTreePath} aggregationPath Aggregation tree path.
   * @param {SparseMerkleSumTreePath} assetTreePath Asset tree path.
   * @returns {SplitAssetProof} New proof.
   */
  public static create(
    assetId: AssetId,
    aggregationPath: SparseMerkleTreePath,
    assetTreePath: SparseMerkleSumTreePath,
  ): SplitAssetProof {
    return new SplitAssetProof(assetId, aggregationPath, assetTreePath);
  }

  /**
   * Create split mint reason from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return split mint reason proof
   */
  public static fromCBOR(bytes: Uint8Array): SplitAssetProof {
    const data = CborDeserializer.decodeArray(bytes, 3);

    return new SplitAssetProof(
      AssetId.fromCBOR(data[0]),
      SparseMerkleTreePath.fromCBOR(data[1]),
      SparseMerkleSumTreePath.fromCBOR(data[2]),
    );
  }

  /**
   * Convert SplitAssetProof to CBOR bytes.
   *
   * @returns {Uint8Array} CBOR bytes.
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.assetId.toCBOR(),
      this.aggregationPath.toCBOR(),
      this.assetTreePath.toCBOR(),
    );
  }
}
