import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { MerkleSumTreePath } from '@unicitylabs/commons/lib/smst/MerkleSumTreePath.js';
import { MerkleSumTreeRootNode } from '@unicitylabs/commons/lib/smst/MerkleSumTreeRootNode.js';
import { MerkleTreePath } from '@unicitylabs/commons/lib/smt/MerkleTreePath.js';
import { MerkleTreeRootNode } from '@unicitylabs/commons/lib/smt/MerkleTreeRootNode.js';

import { SplitToken } from './SplitToken.js';
import { ISerializable } from '../../ISerializable.js';
import { CoinId } from '../../token/fungible/CoinId.js';
import { SplitMintReason } from '../../token/fungible/SplitMintReason.js';
import { SplitMintReasonProof } from '../../token/fungible/SplitMintReasonProof.js';
import { TokenCoinData } from '../../token/fungible/TokenCoinData.js';
import { Token } from '../../token/Token.js';
import { MintTransactionData } from '../MintTransactionData.js';
import { Transaction } from '../Transaction.js';

export class SplitResult {
  public constructor(
    private readonly tokens: SplitToken[],
    private readonly _coinTrees: Map<string, MerkleSumTreeRootNode>,
    private readonly _aggregationTree: MerkleTreeRootNode,
  ) {}

  public get rootHash(): DataHash {
    return this._aggregationTree.hash;
  }

  public async toMintTransactionDataList(
    token: Token<Transaction<MintTransactionData<ISerializable | null>>>,
  ): Promise<MintTransactionData<SplitMintReason>[]> {
    const tokenCoins = new Map(token.coins?.coins.map(([id, value]) => [id.toJSON(), value]) ?? []);
    for (const [coinId, tree] of this._coinTrees) {
      const tokenAmount = tokenCoins.get(coinId);
      if (tokenAmount !== tree.sum) {
        throw new Error(`Invalid split of [${coinId}]: token contained amount ${tokenAmount}, but got ${tree.sum}`);
      }
    }

    const transactions: MintTransactionData<SplitMintReason>[] = [];
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

      transactions.push(
        await MintTransactionData.create(
          splitToken.tokenId,
          splitToken.tokenType,
          splitToken.data,
          TokenCoinData.create(coinData),
          splitToken.recipient,
          splitToken.salt,
          splitToken.dataHash,
          new SplitMintReason(token, proofs),
        ),
      );
    }

    return transactions;
  }
}
