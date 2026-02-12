import { TokenAssetMissingError } from './error/TokenAssetMissingError.js';
import { IPaymentData } from './IPaymentData.js';
import { ISplitPaymentData } from './ISplitPaymentData.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { DataHasherFactory } from '../crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifier } from '../predicate/verification/PredicateVerifier.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { TokenAssetValueMismatchError } from './error/TokenAssetValueMismatchError.js';
import { SparseMerkleTree } from '../smt/plain/SparseMerkleTree.js';
import { SparseMerkleSumTree } from '../smt/sum/SparseMerkleSumTree.js';
import { SparseMerkleSumTreeRootNode } from '../smt/sum/SparseMerkleSumTreeRootNode.js';
import { PayToScriptHash } from '../transaction/PayToScriptHash.js';
import { Token } from '../transaction/Token.js';
import { TokenId } from '../transaction/TokenId.js';
import { TransferTransaction } from '../transaction/TransferTransaction.js';
import { AssetId } from './asset/AssetId.js';
import { PaymentAssetCollection } from './asset/PaymentAssetCollection.js';
import { TokenAssetCountMismatchError } from './error/TokenAssetCountMismatchError.js';
import { BurnPredicate } from './predicate/builtin/BurnPredicate.js';
import { SplitReasonProof } from './SplitReasonProof.js';
import { areUint8ArraysEqual } from '../util/TypedArrayUtils.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationStatus } from '../verification/VerificationStatus.js';

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
   * @param ownerPredicate
   * @param parsePaymentData
   * @param splitTokens
   * @return token split object for submitting info
   */
  public static async split(
    token: Token,
    ownerPredicate: IPredicate,
    parsePaymentData: (bytes: Uint8Array) => Promise<IPaymentData>,
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
    const paymentData = await parsePaymentData(token.genesis.data);
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
      ownerPredicate,
      await PayToScriptHash.create(burnPredicate),
      crypto.getRandomValues(new Uint8Array(32)),
      CborSerializer.encodeNull(),
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

  public static async verify(
    token: Token,
    parsePaymentData: (bytes: Uint8Array) => Promise<ISplitPaymentData>,
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifier,
  ): Promise<VerificationResult<VerificationStatus>> {
    // TODO: Check initial token also or that should be done by client beforehand?

    const data = await parsePaymentData(token.genesis.data);

    if (data.assets == null) {
      return new VerificationResult(
        'TokenSplitReasonVerificationRule',
        VerificationStatus.FAIL,
        'Assets data is missing.',
        [],
      );
    }

    const verificationResult = await data.reason.token.verify(trustBase, predicateVerifier);
    if (verificationResult.status !== VerificationStatus.OK) {
      return new VerificationResult(
        'TokenSplitReasonVerificationRule',
        VerificationStatus.FAIL,
        'Burn token verification failed.',
        [verificationResult],
      );
    }

    if (data.assets.size() !== data.reason.proofs.length) {
      return new VerificationResult(
        'TokenSplitReasonVerificationRule',
        VerificationStatus.FAIL,
        'Total amount of assets differ in token and proofs.',
        [],
      );
    }

    const burntTokenLastTransaction = data.reason.token.transactions.at(-1);
    for (const proof of data.reason.proofs) {
      const aggregationPathResult = await proof.aggregationPath.verify(proof.assetId.toBitString().toBigInt());
      if (!aggregationPathResult.isSuccessful) {
        return new VerificationResult(
          'TokenSplitReasonVerificationRule',
          VerificationStatus.FAIL,
          `Aggregation path verification failed for asset: ${proof.assetId.toString()}`,
          [],
        );
      }

      const assetTreePathResult = await proof.assetTreePath.verify(token.id.toBitString().toBigInt());
      if (!assetTreePathResult.isSuccessful) {
        return new VerificationResult(
          'TokenSplitReasonVerificationRule',
          VerificationStatus.FAIL,
          `Asset tree path verification failed for token: ${token.id.toString()}`,
          [],
        );
      }

      if (!areUint8ArraysEqual(proof.assetTreePath.root.imprint, proof.aggregationPath.steps.at(0)?.data)) {
        return new VerificationResult(
          'TokenSplitReasonVerificationRule',
          VerificationStatus.FAIL,
          'Asset tree root does not match aggregation path leaf.',
          [],
        );
      }

      const amount = data.assets.get(proof.assetId)?.value;
      if (amount === null) {
        return new VerificationResult(
          'TokenSplitReasonVerificationRule',
          VerificationStatus.FAIL,
          `Asset id ${proof.assetId.toString()} not found in asset data.`,
          [],
        );
      }

      if (proof.assetTreePath.steps.at(0)?.value !== amount) {
        return new VerificationResult(
          'TokenSplitReasonVerificationRule',
          VerificationStatus.FAIL,
          `Asset amount for asset id ${proof.assetId.toString()} does not match asset tree leaf.`,
          [],
        );
      }

      if (
        !burntTokenLastTransaction?.recipient.equals(
          await PayToScriptHash.create(BurnPredicate.create(proof.aggregationPath.root.imprint)),
        )
      ) {
        return new VerificationResult(
          'TokenSplitReasonVerificationRule',
          VerificationStatus.FAIL,
          `Aggregation path root does not match burn predicate.`,
          [],
        );
      }
    }

    return new VerificationResult('TokenSplitReasonVerificationRule', VerificationStatus.OK);
  }
}
