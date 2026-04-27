import { TokenAssetMissingError } from './error/TokenAssetMissingError.js';
import { IPaymentData } from './IPaymentData.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { DataHasherFactory } from '../crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { HexConverter } from '../util/HexConverter.js';
import { TokenAssetValueMismatchError } from './error/TokenAssetValueMismatchError.js';
import { SplitReasonProof } from './SplitReasonProof.js';
import { SparseMerkleTree } from '../smt/plain/SparseMerkleTree.js';
import { SparseMerkleSumTree } from '../smt/sum/SparseMerkleSumTree.js';
import { SparseMerkleSumTreeRootNode } from '../smt/sum/SparseMerkleSumTreeRootNode.js';
import { Token } from '../transaction/Token.js';
import { TokenId } from '../transaction/TokenId.js';
import { TransferTransaction } from '../transaction/TransferTransaction.js';
import { AssetId } from './asset/AssetId.js';
import { PaymentAssetCollection } from './asset/PaymentAssetCollection.js';
import { TokenAssetCountMismatchError } from './error/TokenAssetCountMismatchError.js';
import { BurnPredicate } from '../predicate/builtin/BurnPredicate.js';

class ProofMapEntry {
  private constructor(
    public readonly tokenId: TokenId,
    private readonly _proofs: SplitReasonProof[],
  ) {
    this._proofs = _proofs.slice();
  }

  public get proofs(): SplitReasonProof[] {
    return this._proofs.slice();
  }

  public static create(tokenId: TokenId, proofs: SplitReasonProof[]): ProofMapEntry {
    return new ProofMapEntry(tokenId, proofs);
  }
}

class ProofMap {
  private constructor(private readonly _proofs: Map<string, ProofMapEntry>) {}

  public static create(data: [TokenId, SplitReasonProof[]][]): ProofMap {
    return new ProofMap(
      new Map(
        data.map(([tokenId, proofs]) => [HexConverter.encode(tokenId.bytes), ProofMapEntry.create(tokenId, proofs)]),
      ),
    );
  }

  public get(id: TokenId): ProofMapEntry | null {
    return this._proofs.get(HexConverter.encode(id.bytes)) ?? null;
  }

  public size(): number {
    return this._proofs.size;
  }
}

interface ISplit {
  readonly burn: {
    readonly ownerPredicate: BurnPredicate;
    readonly transaction: TransferTransaction;
  };

  readonly proofs: ProofMap;
}

/**
 * Token splitting.
 */
export class TokenSplit {
  /**
   * Split old token to new tokens.
   *
   * @param token token to be used for split
   * @param decodePaymentData
   * @param splitTokens
   * @return token split object for submitting info
   */
  public static async split(
    token: Token,
    decodePaymentData: (bytes: Uint8Array) => Promise<IPaymentData>,
    splitTokens: [TokenId, PaymentAssetCollection][],
  ): Promise<ISplit> {
    const hasher = new DataHasherFactory(HashAlgorithm.SHA256, DataHasher);
    const trees = new Map<string, [AssetId, SparseMerkleSumTree]>();

    for (const [tokenId, assets] of splitTokens) {
      for (const asset of assets.toArray()) {
        const key = HexConverter.encode(asset.id.bytes);
        let tree = trees.get(key)?.[1];
        if (!tree) {
          tree = new SparseMerkleSumTree(hasher);
          trees.set(key, [asset.id, tree]);
        }

        await tree.addLeaf(tokenId.toBitString().toBigInt(), asset.id.bytes, asset.value);
      }
    }

    // Parse this from user object
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

    const proofs: [TokenId, SplitReasonProof[]][] = [];
    for (const [tokenId, assets] of splitTokens) {
      proofs.push([
        tokenId,
        assets
          .toArray()
          .map((asset) =>
            SplitReasonProof.create(
              asset.id,
              aggregationRoot.getPath(asset.id.toBitString().toBigInt()),
              assetTreeRoots.get(HexConverter.encode(asset.id.bytes))!.getPath(tokenId.toBitString().toBigInt()),
            ),
          ),
      ]);
    }

    return {
      burn: {
        ownerPredicate: burnPredicate,
        transaction: burnTransaction,
      },
      proofs: ProofMap.create(proofs),
    };
  }
}
