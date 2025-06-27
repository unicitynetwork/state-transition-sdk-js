import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';

import { SplitToken } from './SplitToken.js';
import { CoinId } from '../../token/fungible/CoinId.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenType } from '../../token/TokenType.js';

export class SplitTokenBuilder {
  private readonly _coins = new Map<string, bigint>();

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

    this._coins.set(coinId.toJSON(), amount);
    return this;
  }

  public toSplitToken(): SplitToken {
    return new SplitToken(
      this.tokenId,
      this.tokenType,
      this._data,
      this.recipient,
      this.dataHash,
      this._salt,
      this._coins,
    );
  }
}
