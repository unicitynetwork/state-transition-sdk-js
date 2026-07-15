import { IAddress } from '../../address/IAddress.js';
import { RootTrustBase } from '../../bft/RootTrustBase.js';
import { DataHash } from '../../hash/DataHash.js';
import { DataHasher } from '../../hash/DataHasher.js';
import { DataHasherFactory } from '../../hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { SparseMerkleTree } from '../../mtree/plain/SparseMerkleTree.js';
import { SparseMerkleTreeRootNode } from '../../mtree/plain/SparseMerkleTreeRootNode.js';
import { SparseMerkleSumTree } from '../../mtree/sum/SparseMerkleSumTree.js';
import { SparseMerkleSumTreeRootNode } from '../../mtree/sum/SparseMerkleSumTreeRootNode.js';
import { BurnPredicate } from '../../predicate/embedded/BurnPredicate.js';
import { BurnPredicateReference } from '../../predicate/embedded/BurnPredicateReference.js';
import { SigningService } from '../../sign/SigningService.js';
import { CoinId } from '../../token/fungible/CoinId.js';
import { SplitMintReason } from '../../token/fungible/SplitMintReason.js';
import { SplitMintReasonProof } from '../../token/fungible/SplitMintReasonProof.js';
import { TokenCoinData } from '../../token/fungible/TokenCoinData.js';
import { Token } from '../../token/Token.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenState } from '../../token/TokenState.js';
import { TokenType } from '../../token/TokenType.js';
import { IMintTransactionReason } from '../IMintTransactionReason.js';
import { MintCommitment } from '../MintCommitment.js';
import { MintTransactionData } from '../MintTransactionData.js';
import { TransferCommitment } from '../TransferCommitment.js';
import { TransferTransaction } from '../TransferTransaction.js';

/**
 * New token request for generating it out of burnt token.
 */
class TokenRequest {
  public constructor(
    public readonly id: TokenId,
    public readonly type: TokenType,
    public readonly data: Uint8Array | null,
    public readonly coinData: TokenCoinData | null,
    public readonly recipient: IAddress,
    public readonly salt: Uint8Array,
    public readonly recipientDataHash: DataHash | null,
  ) {
    if (coinData?.length == 0) {
      throw new Error('Token must have at least one coin');
    }
  }
}

/**
 * Token split request object.
 */
class TokenSplit {
  public constructor(
    private readonly token: Token,
    private readonly aggregationRoot: SparseMerkleTreeRootNode,
    private readonly coinRoots: Map<string, SparseMerkleSumTreeRootNode>,
    private readonly tokens: TokenRequest[],
  ) {}

  /**
   * Create burn commitment to burn token going through split.
   *
   * @param salt           burn commitment salt
   * @param signingService signing service used to unlock token
   * @return transfer commitment for sending to unicity service
   */
  public async createBurnCommitment(salt: Uint8Array, signingService: SigningService): Promise<TransferCommitment> {
    const predicateReference = await BurnPredicateReference.create(this.token.type, this.aggregationRoot.hash);

    return TransferCommitment.create(
      this.token,
      await predicateReference.toAddress(),
      salt,
      null,
      null,
      signingService,
    );
  }

  /**
   * Create split mint commitments after burn transaction is received.
   *
   * @param trustBase       trust base for burn transaction verification
   * @param burnTransaction burn transaction
   * @return list of mint commitments for sending to unicity service
   * @throws VerificationException if token verification fails
   */
  public async createSplitMintCommitments(
    trustBase: RootTrustBase,
    burnTransaction: TransferTransaction,
  ): Promise<MintCommitment[]> {
    const burnedToken = await this.token.update(
      trustBase,
      new TokenState(new BurnPredicate(this.token.id, this.token.type, this.aggregationRoot.hash), null),
      burnTransaction,
    );

    return Promise.all(
      this.tokens.map(async (request) => {
        const splitReason = new SplitMintReason(
          burnedToken,
          request.coinData!.coins.map(
            ([coinId]) =>
              new SplitMintReasonProof(
                coinId,
                this.aggregationRoot.getPath(coinId.toBitString().toBigInt()),
                this.coinRoots.get(coinId.toJSON())!.getPath(request.id.toBitString().toBigInt()),
              ),
          ),
        );

        const reasons = new Map<string, IMintTransactionReason>([[splitReason.getTypeId().toHexString(), splitReason]]);

        return MintTransactionData.create(
          request.id,
          request.type,
          request.data,
          request.coinData,
          request.recipient,
          request.salt,
          request.recipientDataHash,
          reasons,
        ).then((data) => MintCommitment.create(data));
      }),
    );
  }
}

/**
 * Token splitting builder.
 */
export class TokenSplitBuilder {
  private readonly tokens = new Map<string, TokenRequest>();

  /**
   * Create new token which will be created from selected token.
   *
   * @param id                new token id
   * @param type              new token type
   * @param data              new token data
   * @param coinData          new token coin data
   * @param recipient         new token recipient address
   * @param salt              new token salt
   * @param recipientDataHash new token recipient data hash
   * @return current builder
   */
  public createToken(
    id: TokenId,
    type: TokenType,
    data: Uint8Array | null,
    coinData: TokenCoinData | null,
    recipient: IAddress,
    salt: Uint8Array,
    recipientDataHash: DataHash | null,
  ): this {
    this.tokens.set(id.toJSON(), new TokenRequest(id, type, data, coinData, recipient, salt, recipientDataHash));

    return this;
  }

  /**
   * Split old token to new tokens.
   *
   * @param token token to be used for split
   * @return token split object for submitting info
   */
  public async build(token: Token): Promise<TokenSplit> {
    const trees = new Map<string, [CoinId, SparseMerkleSumTree]>();

    for (const data of this.tokens.values()) {
      for (const [coinId, amount] of data.coinData!.coins) {
        let tree = trees.get(coinId.toJSON())?.[1];
        if (!tree) {
          tree = new SparseMerkleSumTree(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher));
          trees.set(coinId.toJSON(), [coinId, tree]);
        }

        await tree.addLeaf(data.id.toBitString().toBigInt(), coinId.bytes, amount);
      }
    }

    if (trees.size !== token.coins?.length) {
      throw new Error('Token has different number of coins than expected');
    }

    const aggregationTree = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, DataHasher));
    const coinRoots = new Map<string, SparseMerkleSumTreeRootNode>();
    for (const [coinId, tree] of trees.values()) {
      const coinsInToken = token.coins.get(coinId);
      const root = await tree.calculateRoot();
      if (root.value !== coinsInToken) {
        throw new Error(`Token contained ${coinsInToken} ${coinId} coins, but tree has ${root.value}`);
      }

      coinRoots.set(coinId.toJSON(), root);
      await aggregationTree.addLeaf(coinId.toBitString().toBigInt(), root.hash.imprint);
    }

    return new TokenSplit(token, await aggregationTree.calculateRoot(), coinRoots, Array.from(this.tokens.values()));
  }
}
