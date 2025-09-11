import { DataHasherFactory } from '@unicitylabs/commons/lib/hash/DataHasherFactory.js';
import type { IDataHasher } from '@unicitylabs/commons/lib/hash/IDataHasher.js';
import { MerkleSumTreeRootNode } from '@unicitylabs/commons/lib/smst/MerkleSumTreeRootNode.js';
import { SparseMerkleSumTree } from '@unicitylabs/commons/lib/smst/SparseMerkleSumTree.js';
import { SparseMerkleTree } from '@unicitylabs/commons/lib/smt/SparseMerkleTree.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { SplitResult } from './SplitResult.js';
import { SplitToken } from './SplitToken.js';
import { SplitTokenBuilder } from './SplitTokenBuilder.js';
import { CoinId } from '../../token/fungible/CoinId.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenState } from '../../token/TokenState.js';
import { TokenType } from '../../token/TokenType.js';

export class TokenSplitBuilder {
  private readonly tokens = new Map<string, SplitTokenBuilder>();

  public createToken(
    id: TokenId,
    type: TokenType,
    data: Uint8Array,
    recipient: string,
    state: TokenState,
    stateDataHasherFactory: DataHasherFactory<IDataHasher>,
    salt: Uint8Array,
  ): SplitTokenBuilder {
    const idHex = HexConverter.encode(id.bytes);
    if (this.tokens.has(idHex)) {
      throw new Error('Token already exists in split request');
    }

    const builder = new SplitTokenBuilder(id, type, data, recipient, state, stateDataHasherFactory, salt);
    this.tokens.set(idHex, builder);
    return builder;
  }

  public async build(factory: DataHasherFactory<IDataHasher>): Promise<SplitResult> {
    const aggregationTree = new SparseMerkleTree(factory);
    const trees = new Map<string, SparseMerkleSumTree>();
    const tokens: SplitToken[] = [];
    for (const builder of this.tokens.values()) {
      const token = builder.build();
      for (const [coinId, amount] of token.coins) {
        const treesKey = coinId.toJSON();
        let tree = trees.get(treesKey);
        if (!tree) {
          tree = new SparseMerkleSumTree(factory);
          trees.set(treesKey, tree);
        }
        tree.addLeaf(builder.tokenId.toBitString().toBigInt(), coinId.toCBOR(), amount);
      }
      tokens.push(token);
    }

    const coinTrees = new Map<string, MerkleSumTreeRootNode>();
    for (const [coinId, tree] of trees.entries()) {
      const root = await tree.calculateRoot();
      coinTrees.set(coinId, root);
      aggregationTree.addLeaf(CoinId.fromJSON(coinId).toBitString().toBigInt(), root.hash.imprint);
    }

    return new SplitResult(tokens, coinTrees, await aggregationTree.calculateRoot());
  }
}
