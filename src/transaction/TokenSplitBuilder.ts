import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasherFactory } from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';
import type { IDataHasher } from '@unicitylabs/commons/lib/hash/IDataHasher.js';
import { MerkleSumTreePath } from '@unicitylabs/commons/lib/smst/MerkleSumTreePath.js';
import { MerkleSumTreeRootNode } from '@unicitylabs/commons/lib/smst/MerkleSumTreeRootNode.js';
import { SparseMerkleSumTreeBuilder } from '@unicitylabs/commons/lib/smst/SparseMerkleSumTreeBuilder.js';
import { MerkleTreePath } from '@unicitylabs/commons/lib/smt/MerkleTreePath.js';
import { MerkleTreeRootNode } from '@unicitylabs/commons/lib/smt/MerkleTreeRootNode.js';
import { SparseMerkleTreeBuilder } from '@unicitylabs/commons/lib/smt/SparseMerkleTreeBuilder.js';
import { BigintConverter } from '@unicitylabs/commons/lib/util/BigintConverter.js';

import { MintTransactionData } from './MintTransactionData.js';
import { Transaction } from './Transaction.js';
import { ISerializable } from '../ISerializable.js';
import { CoinId } from '../token/fungible/CoinId.js';
import { SplitMintReason } from '../token/fungible/SplitMintReason.js';
import { SplitMintReasonProof } from '../token/fungible/SplitMintReasonProof.js';
import { TokenCoinData } from '../token/fungible/TokenCoinData.js';
import { Token } from '../token/Token.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

class SplitToken {
  private readonly _coins = new Map<bigint, bigint>();

  public constructor(
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    private readonly _data: Uint8Array,
    public readonly recipient: string,
    public readonly dataHash: DataHash,
    private readonly _salt: Uint8Array,
  ) {
    this._data = new Uint8Array(_data);
    this._salt = new Uint8Array(_salt);
  }

  public get coins(): Map<bigint, bigint> {
    return new Map(this._coins);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public get salt(): Uint8Array {
    return new Uint8Array(this._salt);
  }

  public addCoin(coinId: CoinId, amount: bigint): this {
    if (amount <= 0n) {
      throw new Error('Amount must be greater than zero');
    }

    this._coins.set(coinId.toBitString().toBigInt(), amount);
    return this;
  }
}

class TokenSplitData {
  public constructor(
    private readonly tokens: Map<bigint, SplitToken>,
    private readonly _coinTrees: Map<bigint, MerkleSumTreeRootNode>,
    private readonly _aggregationTree: MerkleTreeRootNode,
  ) {}

  public get rootHash(): DataHash {
    return this._aggregationTree.hash;
  }

  public async toMintTransactionDataList(
    token: Token<Transaction<MintTransactionData<ISerializable | null>>>,
  ): Promise<MintTransactionData<SplitMintReason>[]> {
    for (const [coinId, tree] of this._coinTrees) {
      const tokenAmount = token.coins?.getByKey(coinId);
      if (tokenAmount !== tree.sum) {
        throw new Error(`Invalid split of [${coinId}]: token contained amount ${tokenAmount}, but got ${tree.sum}`);
      }
    }

    const transactions: MintTransactionData<SplitMintReason>[] = [];
    for (const [tokenId, splitToken] of this.tokens.entries()) {
      const coinData: [CoinId, bigint][] = [];
      const proofs = new Map<bigint, SplitMintReasonProof>();
      for (const [coinId, amount] of splitToken.coins.entries()) {
        proofs.set(
          coinId,
          new SplitMintReasonProof(
            this._aggregationTree.getPath(coinId) as MerkleTreePath,
            this._coinTrees.get(coinId)?.getPath(tokenId) as MerkleSumTreePath,
          ),
        );
        coinData.push([CoinId.fromBigInt(coinId), amount]);
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

export class TokenSplitBuilder {
  private readonly tokens = new Map<bigint, SplitToken>();

  public createToken(
    id: TokenId,
    type: TokenType,
    data: Uint8Array,
    recipient: string,
    dataHash: DataHash,
    salt: Uint8Array,
  ): SplitToken {
    if (this.tokens.has(id.toBitString().toBigInt())) {
      throw new Error('Token already exists in split request');
    }

    const builder = new SplitToken(id, type, data, recipient, dataHash, salt);
    this.tokens.set(id.toBitString().toBigInt(), builder);
    return builder;
  }

  public async build(factory: DataHasherFactory<IDataHasher>): Promise<TokenSplitData> {
    const aggregationTree = new SparseMerkleTreeBuilder(factory);
    const trees = new Map<bigint, SparseMerkleSumTreeBuilder>();
    for (const [tokenId, token] of this.tokens.entries()) {
      for (const [coinId, amount] of token.coins.entries()) {
        let tree = trees.get(coinId);
        if (!tree) {
          tree = new SparseMerkleSumTreeBuilder(factory);
          trees.set(coinId, tree);
        }
        tree.addLeaf(tokenId, BigintConverter.encode(coinId), amount);
      }
    }

    const coinTrees = new Map<bigint, MerkleSumTreeRootNode>();
    for (const [coinId, tree] of trees.entries()) {
      const root = await tree.calculateRoot();
      coinTrees.set(coinId, root);
      aggregationTree.addLeaf(coinId, root.hash.imprint);
    }

    return new TokenSplitData(this.tokens, coinTrees, await aggregationTree.calculateRoot());
  }
}
