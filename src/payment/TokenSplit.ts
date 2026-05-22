import { DuplicateSplitTokenIdError } from './error/DuplicateSplitTokenIdError.js';
import { TokenAssetMissingError } from './error/TokenAssetMissingError.js';
import { IPaymentData } from './IPaymentData.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { DataHasherFactory } from '../crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { HexConverter } from '../util/HexConverter.js';
import { TokenAssetValueMismatchError } from './error/TokenAssetValueMismatchError.js';
import { SplitAssetProof } from './SplitAssetProof.js';
import { SplitToken } from './SplitToken.js';
import { SplitTokenRequest } from './SplitTokenRequest.js';
import { SparseMerkleTree } from '../smt/plain/SparseMerkleTree.js';
import { SparseMerkleSumTree } from '../smt/sum/SparseMerkleSumTree.js';
import { SparseMerkleSumTreeRootNode } from '../smt/sum/SparseMerkleSumTreeRootNode.js';
import { Token } from '../transaction/Token.js';
import { TokenId } from '../transaction/TokenId.js';
import { TransferTransaction } from '../transaction/TransferTransaction.js';
import { AssetId } from './asset/AssetId.js';
import { TokenAssetCountMismatchError } from './error/TokenAssetCountMismatchError.js';
import { BurnPredicate } from '../predicate/builtin/BurnPredicate.js';

/**
 * Result of splitting a token.
 */
export interface ISplit {
  readonly burn: {
    readonly ownerPredicate: BurnPredicate;
    readonly transaction: TransferTransaction;
  };
  readonly tokens: SplitToken[];
}

/**
 * Token splitting.
 */
export class TokenSplit {
  /**
   * Split a token into new outputs.
   *
   * @param {Token} token Source token to split.
   * @param {(bytes: Uint8Array) => Promise<IPaymentData>} decodePaymentData Decoder for the source token's payment data.
   * @param {SplitTokenRequest[]} requests Per-output mint requests.
   * @returns {Promise<ISplit>} Burn transaction and split tokens ready to mint.
   */
  public static async split(
    token: Token,
    decodePaymentData: (bytes: Uint8Array) => Promise<IPaymentData>,
    requests: SplitTokenRequest[],
  ): Promise<ISplit> {
    const hasher = new DataHasherFactory(HashAlgorithm.SHA256, DataHasher);
    const trees = new Map<string, [AssetId, SparseMerkleSumTree]>();
    const networkId = token.genesis.networkId;

    const requestsWithTokenId = new Map<bigint, [SplitTokenRequest, TokenId]>();
    for (const request of requests) {
      const tokenId = await TokenId.fromSalt(networkId, request.salt);
      const tokenIdPath = tokenId.toBitString().toBigInt();
      if (requestsWithTokenId.has(tokenIdPath)) {
        throw new DuplicateSplitTokenIdError(tokenId.toString());
      }
      requestsWithTokenId.set(tokenIdPath, [request, tokenId]);

      for (const asset of request.assets.toArray()) {
        const key = HexConverter.encode(asset.id.bytes);
        let tree = trees.get(key)?.[1];
        if (!tree) {
          tree = new SparseMerkleSumTree(hasher);
          trees.set(key, [asset.id, tree]);
        }

        await tree.addLeaf(tokenIdPath, asset.id.bytes, asset.value);
      }
    }

    const paymentDataBytes = token.genesis.data;
    const paymentData = paymentDataBytes ? await decodePaymentData(paymentDataBytes) : null;
    if (paymentData == null) {
      throw new Error('Payment data is missing.');
    }

    const assets = paymentData.assets;

    if (trees.size !== assets.size()) {
      throw new TokenAssetCountMismatchError();
    }

    const aggregationTree = new SparseMerkleTree(hasher);
    const assetTreeRoots = new Map<string, SparseMerkleSumTreeRootNode>();
    for (const [assetId, tree] of trees.values()) {
      const tokenAsset = assets.get(assetId);
      if (tokenAsset == null) {
        throw new TokenAssetMissingError(assetId);
      }

      const root = await tree.calculateRoot();
      if (root.value !== tokenAsset.value) {
        throw new TokenAssetValueMismatchError(assetId, tokenAsset.value, root.value);
      }

      assetTreeRoots.set(HexConverter.encode(assetId.bytes), root);
      await aggregationTree.addLeaf(assetId.toBitString().toBigInt(), root.hash.imprint);
    }

    const aggregationRoot = await aggregationTree.calculateRoot();
    const burnPredicate = BurnPredicate.create(aggregationRoot.hash.imprint);
    const burnTransaction = await TransferTransaction.create(
      token,
      burnPredicate,
      crypto.getRandomValues(new Uint8Array(32)),
    );

    const tokens: SplitToken[] = Array.from(requestsWithTokenId.values()).map(
      ([request, tokenId]) =>
        new SplitToken(
          networkId,
          request.recipient,
          request.tokenType,
          request.salt,
          request.assets,
          request.assets
            .toArray()
            .map((asset) =>
              SplitAssetProof.create(
                asset.id,
                aggregationRoot.getPath(asset.id.toBitString().toBigInt()),
                assetTreeRoots.get(HexConverter.encode(asset.id.bytes))!.getPath(tokenId.toBitString().toBigInt()),
              ),
            ),
        ),
    );

    return {
      burn: {
        ownerPredicate: burnPredicate,
        transaction: burnTransaction,
      },
      tokens,
    };
  }
}
