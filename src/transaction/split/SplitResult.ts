import { SplitToken } from './SplitToken.js';
import { DataHash } from '../../hash/DataHash.js';
import { ISerializable } from '../../ISerializable.js';
import { MerkleTreePath } from '../../mtree/plain/MerkleTreePath.js';
import { MerkleTreeRootNode } from '../../mtree/plain/MerkleTreeRootNode.js';
import { MerkleSumTreePath } from '../../mtree/sum/MerkleSumTreePath.js';
import { MerkleSumTreeRootNode } from '../../mtree/sum/MerkleSumTreeRootNode.js';
import { CoinId } from '../../token/fungible/CoinId.js';
import { SplitMintReason } from '../../token/fungible/SplitMintReason.js';
import { SplitMintReasonProof } from '../../token/fungible/SplitMintReasonProof.js';
import { TokenCoinData } from '../../token/fungible/TokenCoinData.js';
import { Token } from '../../token/Token.js';
import { TokenState } from '../../token/TokenState.js';
import { MintTransactionData } from '../MintTransactionData.js';
import { Transaction } from '../Transaction.js';

interface ISplitTokenResult {
  readonly transactionData: MintTransactionData<SplitMintReason>;
  readonly state: TokenState;
}

export class SplitResult {
  public constructor(
    private readonly tokens: SplitToken[],
    private readonly _coinTrees: Map<string, MerkleSumTreeRootNode>,
    private readonly _aggregationTree: MerkleTreeRootNode,
  ) {}

  public get rootHash(): DataHash {
    return this._aggregationTree.hash;
  }

  public async getSplitTokenDataList(
    token: Token<Transaction<MintTransactionData<ISerializable | null>>>,
  ): Promise<ISplitTokenResult[]> {
    const tokenCoins = new Map(token.coins?.coins.map(([id, value]) => [id.toJSON(), value]) ?? []);
    if (this._coinTrees.size !== tokenCoins.size) {
      throw new Error(`Invalid token split: Different amount of coins.`);
    }

    for (const [coinId, tree] of this._coinTrees) {
      const tokenAmount = tokenCoins.get(coinId);
      if (tokenAmount !== tree.sum) {
        throw new Error(`Invalid split of [${coinId}]: token contained amount ${tokenAmount}, but got ${tree.sum}`);
      }
    }

    const result: ISplitTokenResult[] = [];
    for (const splitToken of this.tokens) {
      const coinData: [CoinId, bigint][] = [];
      const proofs = new Map<bigint, SplitMintReasonProof>();
      for (const [coinId, amount] of splitToken.coins) {
        const coinIdBits = coinId.toBitString().toBigInt();
        proofs.set(
          coinIdBits,
          new SplitMintReasonProof(
            this._aggregationTree.getPath(coinIdBits) as MerkleTreePath,
            this._coinTrees
              .get(coinId.toJSON())
              ?.getPath(splitToken.tokenId.toBitString().toBigInt()) as MerkleSumTreePath,
          ),
        );
        coinData.push([coinId, amount]);
      }

      result.push({
        state: splitToken.state,
        transactionData: await MintTransactionData.create(
          splitToken.tokenId,
          splitToken.tokenType,
          splitToken.data,
          TokenCoinData.create(coinData),
          splitToken.recipient,
          splitToken.salt,
          splitToken.state.data
            ? await splitToken.stateDataHasherFactory.create().update(splitToken.state.data).digest()
            : null,
          new SplitMintReason(token, proofs),
        ),
      });
    }

    return result;
  }
}
