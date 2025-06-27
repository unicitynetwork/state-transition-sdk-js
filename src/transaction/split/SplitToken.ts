import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';

import { CoinId } from '../../token/fungible/CoinId.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenType } from '../../token/TokenType.js';

export class SplitToken {
  public constructor(
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    private readonly _data: Uint8Array,
    public readonly recipient: string,
    public readonly dataHash: DataHash,
    private readonly _salt: Uint8Array,
    private readonly _coins: Map<string, bigint>,
  ) {
    this._coins = new Map(_coins);
  }

  public get data(): Uint8Array {
    return new Uint8Array(this._data);
  }

  public get salt(): Uint8Array {
    return new Uint8Array(this._salt);
  }

  public get coins(): [CoinId, bigint][] {
    return Array.from(this._coins.entries()).map(([key, value]) => [CoinId.fromJSON(key), value]);
  }
}
