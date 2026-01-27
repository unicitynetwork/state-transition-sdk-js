import { IPaymentData } from './IPaymentData.js';
import { ISplitPaymentData } from './ISplitPaymentData.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { CertificationData } from '../api/CertificationData.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { DataHasherFactory } from '../crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { IPredicate } from '../predicate/IPredicate.js';
import { PredicateVerifier } from '../predicate/verification/PredicateVerifier.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';
import { SparseMerkleTree } from '../smt/plain/SparseMerkleTree.js';
import { SparseMerkleTreeRootNode } from '../smt/plain/SparseMerkleTreeRootNode.js';
import { SparseMerkleSumTree } from '../smt/sum/SparseMerkleSumTree.js';
import { SparseMerkleSumTreeRootNode } from '../smt/sum/SparseMerkleSumTreeRootNode.js';
import { CertifiedTransferTransaction } from '../transaction/CertifiedTransferTransaction.js';
import { MintTransaction } from '../transaction/MintTransaction.js';
import { PayToScriptHash } from '../transaction/PayToScriptHash.js';
import { Token } from '../transaction/Token.js';
import { TokenId } from '../transaction/TokenId.js';
import { TokenType } from '../transaction/TokenType.js';
import { TransferTransaction } from '../transaction/TransferTransaction.js';
import { AssetId } from './asset/AssetId.js';
import { PaymentAssetCollection } from './asset/PaymentAssetCollection.js';
import { BurnPredicate } from './predicate/builtin/BurnPredicate.js';

/**
 * New token request for generating it out of burnt token.
 */
export class SplitToken {
  public constructor(
    public readonly id: TokenId,
    public readonly assets: PaymentAssetCollection,
  ) {
    if (assets.size() == 0) {
      throw new Error('Token must have at least one asset');
    }
  }
}

interface ISplit {
  burnTransaction: TransferTransaction;
  tokens: SplitToken[];
}

/**
 * Token splitting builder.
 */
export class SplitBuilder {
  private readonly hasher = new DataHasherFactory(HashAlgorithm.SHA256, DataHasher);
  private readonly tokens = new Map<string, SplitToken>();

  /**
   * Split old token to new tokens.
   *
   * @param token token to be used for split
   * @param ownerPredicate
   * @param parsePaymentData
   * @param splitTokens
   * @return token split object for submitting info
   */
  public async split(
    token: Token,
    ownerPredicate: IPredicate,
    parsePaymentData: (bytes: Uint8Array) => IPaymentData,
    splitTokens: SplitToken[],
  ): Promise<ISplit> {
    const trees = new Map<string, [AssetId, SparseMerkleSumTree]>();

    for (const splitToken of splitTokens) {
      for (const asset of splitToken.assets.toArray()) {
        const key = HexConverter.encode(asset.id.bytes);
        let tree = trees.get(key)?.[1];
        if (!tree) {
          tree = new SparseMerkleSumTree(this.hasher);
          trees.set(key, [asset.id, tree]);
        }

        await tree.addLeaf(splitToken.id.toBitString().toBigInt(), asset.id.bytes, asset.value);
      }
    }

    // Parse this from user object
    const assets = parsePaymentData(token.genesis.data).assets;

    if (trees.size !== assets.size()) {
      throw new Error('Token has different number of coins than expected');
    }

    const aggregationTree = new SparseMerkleTree(this.hasher);
    const assetTreeRoots = new Map<string, SparseMerkleSumTreeRootNode>();
    for (const [assetId, tree] of trees.values()) {
      const assetsInToken = assets.get(assetId);
      const root = await tree.calculateRoot();
      if (root.value !== assetsInToken?.value) {
        throw new Error(
          `Token contained ${assetsInToken?.value} ${assetId.toString()} assets, but tree has ${root.value}`,
        );
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
      CborSerializer.encodeArray(),
    );

    return {
      burnTransaction,
      tokens: Array.from(this.tokens.values()),
    };
  }
}

/**
 * Token split request object.
 */
class Split {
  public constructor(
    private readonly token: Token,
    private readonly aggregationRoot: SparseMerkleTreeRootNode,
    private readonly assetRoots: Map<string, SparseMerkleSumTreeRootNode>,
    private readonly splitTokens: SplitToken[],
  ) {}

  public async burn(ownerPredicate: IPredicate, witness: Uint8Array): Promise<CertificationData> {
    const burnPredicate = BurnPredicate.create(this.aggregationRoot.hash.imprint);
    const burnTransaction = await TransferTransaction.create(
      this.token,
      ownerPredicate,
      await PayToScriptHash.create(burnPredicate),
      crypto.getRandomValues(new Uint8Array(32)),
      CborSerializer.encodeArray(),
    );

    return CertificationData.fromTransferTransaction(burnTransaction, witness);
  }

  /**
   * Create split mint commitments after burn transaction is received.
   *
   * @param trustBase       trust base for burn transaction verification
   * @param predicateVerifier
   * @param burnTransaction burn transaction
   * @return list of mint commitments for sending to unicity service
   * @throws VerificationException if token verification fails
   */
  public async createSplitMintCommitments(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifier,
    burnTransaction: CertifiedTransferTransaction,
  ): Promise<MintTransaction[]> {
    const burnedToken = await this.token.transfer(trustBase, predicateVerifier, burnTransaction);

    return Promise.all(
      this.splitTokens.map((request) =>
        MintTransaction.create(request.recipient, request.id, request.type, request.data.toCBOR()).then((data) =>
          MintCommitment.create(data),
        ),
      ),
    );
  }
}
// TODO: What if one token id is taken while minting new tokens?
