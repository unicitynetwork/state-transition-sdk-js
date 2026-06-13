import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { AssetId } from '../../../src/payment/asset/AssetId.js';
import { SplitAssetProof } from '../../../src/payment/SplitAssetProof.js';
import { SparseMerkleTreePath } from '../../../src/smt/plain/SparseMerkleTreePath.js';
import { SparseMerkleTreePathStep } from '../../../src/smt/plain/SparseMerkleTreePathStep.js';
import { SparseMerkleSumTreePath } from '../../../src/smt/sum/SparseMerkleSumTreePath.js';
import { SparseMerkleSumTreePathStep } from '../../../src/smt/sum/SparseMerkleSumTreePathStep.js';
import { HexConverter } from '../../../src/util/HexConverter.js';

/**
 * PR #110 — SplitAssetProof carries the per-asset (aggregationPath, assetTreePath) bundle
 * inside SplitMintJustification. This test pins its CBOR round-trip.
 */
describe('SplitAssetProof', () => {
  it('round-trips byte-for-byte', () => {
    const assetId = new AssetId(new Uint8Array(32).fill(0x42));
    const aggregationPath = new SparseMerkleTreePath(DataHash.fromImprint(new Uint8Array(34)), [
      new SparseMerkleTreePathStep(0n, new Uint8Array([1, 2, 3])),
    ]);
    const assetTreePath = new SparseMerkleSumTreePath(DataHash.fromImprint(new Uint8Array(34)), [
      new SparseMerkleSumTreePathStep(0n, new Uint8Array([4, 5, 6]), 10n),
    ]);

    const proof = SplitAssetProof.create(assetId, aggregationPath, assetTreePath);
    const encoded = proof.toCBOR();
    const decoded = SplitAssetProof.fromCBOR(encoded);

    expect(HexConverter.encode(decoded.toCBOR())).toEqual(HexConverter.encode(encoded));
    expect(HexConverter.encode(decoded.assetId.bytes)).toEqual(HexConverter.encode(assetId.bytes));
    expect(decoded.aggregationPath.steps.length).toEqual(1);
    expect(decoded.assetTreePath.steps.length).toEqual(1);
  });

  it('rejects an arity-2 array (PR #110 strict-arity gate at SplitAssetProof.fromCBOR)', () => {
    const assetId = new AssetId(new Uint8Array(32).fill(0x42));
    const aggregationPath = new SparseMerkleTreePath(DataHash.fromImprint(new Uint8Array(34)), []);
    // Build a malformed 2-element array (missing assetTreePath).
    const truncated = new Uint8Array([
      0x82, // CBOR array of length 2
      ...assetId.toCBOR(),
      ...aggregationPath.toCBOR(),
    ]);

    expect(() => SplitAssetProof.fromCBOR(truncated)).toThrow();
  });
});
