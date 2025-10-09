import { NameTagToken } from './NameTagToken.js';
import { TokenId } from './TokenId.js';
import { TokenState } from './TokenState.js';
import { TokenType } from './TokenType.js';
import { ISerializable } from '../ISerializable.js';
import { TokenCborSerializer } from '../serializer/cbor/token/TokenCborSerializer.js';
import { Transaction } from '../transaction/Transaction.js';
import { TokenCoinData } from './fungible/TokenCoinData.js';
import { ITokenJson, TokenJsonSerializer } from '../serializer/json/token/TokenJsonSerializer.js';
import { MintTransactionData } from '../transaction/MintTransactionData.js';
import { TransactionData } from '../transaction/TransactionData.js';
import { dedent } from '../util/StringUtils.js';

/** Current serialization version for tokens. */
export const TOKEN_VERSION = '2.0';

/**
 * In-memory representation of a token including its transaction history.
 */
export class Token<MT extends Transaction<MintTransactionData<ISerializable | null>>> {
  /**
   * Create a new token instance.
   * @param state Current state of the token including state data and unlock predicate
   * @param genesis Mint transaction that created this token
   * @param _transactions History of transactions
   * @param _nametagTokens List of nametag tokens associated with this token
   * @param version Serialization version of the token, defaults to {@link TOKEN_VERSION}
   */
  public constructor(
    public readonly state: TokenState,
    public readonly genesis: MT,
    private readonly _transactions: Transaction<TransactionData>[] = [],
    private readonly _nametagTokens: NameTagToken[] = [],
    public readonly version: string = TOKEN_VERSION,
  ) {
    this._nametagTokens = _nametagTokens.slice();
    this._transactions = _transactions.slice();
  }

  public get id(): TokenId {
    return this.genesis.data.tokenId;
  }

  public get type(): TokenType {
    return this.genesis.data.tokenType;
  }

  /**
   * Token immutable data.
   */
  public get data(): Uint8Array {
    return this.genesis.data.tokenData;
  }

  public get coins(): TokenCoinData | null {
    return this.genesis.data.coinData;
  }

  /** Nametag tokens associated with this token. */
  public get nametagTokens(): NameTagToken[] {
    return this._nametagTokens.slice();
  }

  /** History of all transactions starting with the mint transaction. */
  public get transactions(): Transaction<TransactionData>[] {
    return this._transactions.slice();
  }

  /** Serialize this token to JSON. */
  public toJSON(): ITokenJson {
    return TokenJsonSerializer.serialize(this);
  }

  /** Serialize this token to CBOR. */
  public toCBOR(): Uint8Array {
    return TokenCborSerializer.serialize(this);
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
        Token[${this.version}]:
          Id: ${this.id.toString()}
          Type: ${this.type.toString()}
          Data: 
            ${this.data.toString()}
          Coins:
            ${this.coins?.toString() ?? null}
          State:
            ${this.state.toString()}
          Transactions: [
            ${this.transactions.map((transition) => transition.toString()).join('\n')}
          ]
          Nametag Tokens: [ 
            ${this.nametagTokens.map((token) => token.toString()).join('\n')}
          ]
      `;
  }
}
