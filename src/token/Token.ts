import { TokenId } from './TokenId.js';
import { ITokenStateJson, TokenState } from './TokenState.js';
import { TokenType } from './TokenType.js';
import { ProxyAddress } from '../address/ProxyAddress.js';
import { RootTrustBase } from '../bft/RootTrustBase.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { PredicateEngineService } from '../predicate/PredicateEngineService.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { IMintTransactionReason } from '../transaction/IMintTransactionReason.js';
import { Transaction } from '../transaction/Transaction.js';
import { TokenCoinData } from './fungible/TokenCoinData.js';
import { IMintTransactionJson, MintTransaction } from '../transaction/MintTransaction.js';
import { ITransferTransactionJson, TransferTransaction } from '../transaction/TransferTransaction.js';
import { TransferTransactionData } from '../transaction/TransferTransactionData.js';
import { dedent } from '../util/StringUtils.js';
import { VerificationError } from '../verification/VerificationError.js';
import { VerificationResult } from '../verification/VerificationResult.js';
import { VerificationResultCode } from '../verification/VerificationResultCode.js';

/** Current serialization version for tokens. */
export const TOKEN_VERSION = '2.0';

export interface ITokenJson {
  readonly version: string;
  readonly state: ITokenStateJson;
  readonly genesis: IMintTransactionJson;
  readonly transactions: ITransferTransactionJson[];
  readonly nametags: ITokenJson[];
}

/**
 * In-memory representation of a token including its transaction history.
 */
export class Token<R extends IMintTransactionReason> {
  /**
   * Create a new token instance.
   * @param state Current state of the token including state data and unlock predicate
   * @param genesis Mint transaction that created this token
   * @param _transactions History of transactions
   * @param _nametagTokens List of nametag tokens associated with this token
   * @param version Serialization version of the token, defaults to {@link TOKEN_VERSION}
   */
  private constructor(
    public readonly state: TokenState,
    public readonly genesis: MintTransaction<R>,
    private readonly _transactions: TransferTransaction[] = [],
    private readonly _nametagTokens: Token<IMintTransactionReason>[] = [],
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
  public get data(): Uint8Array | null {
    return this.genesis.data.tokenData;
  }

  public get coins(): TokenCoinData | null {
    return this.genesis.data.coinData;
  }

  /** Nametag tokens associated with this token. */
  public get nametagTokens(): Token<IMintTransactionReason>[] {
    return this._nametagTokens.slice();
  }

  /** History of all transactions starting with the mint transaction. */
  public get transactions(): TransferTransaction[] {
    return this._transactions.slice();
  }

  /**
   * Create token from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return token
   */
  public static async fromCBOR(bytes: Uint8Array): Promise<Token<IMintTransactionReason>> {
    const data = CborDeserializer.readArray(bytes);

    const version = CborDeserializer.readTextString(data[0]);
    if (version !== TOKEN_VERSION) {
      throw new Error(`Unsupported token version: ${version}`);
    }

    return new Token(
      TokenState.fromCBOR(data[1]),
      await MintTransaction.fromCBOR(data[2]),
      await Promise.all(
        CborDeserializer.readArray(data[3]).map((transaction) => TransferTransaction.fromCBOR(transaction)),
      ),
      await Promise.all(CborDeserializer.readArray(data[4]).map((token) => Token.fromCBOR(token))),
    );
  }

  public static isJSON(input: unknown): input is ITokenJson {
    return (
      typeof input === 'object' &&
      input !== null &&
      'version' in input &&
      input.version === TOKEN_VERSION &&
      'state' in input &&
      'genesis' in input &&
      'transactions' in input &&
      'nametags' in input
    );
  }

  public static async fromJSON(input: unknown): Promise<Token<IMintTransactionReason>> {
    if (!Token.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new Token(
      TokenState.fromJSON(input.state),
      await MintTransaction.fromJSON(input.genesis),
      await Promise.all(input.transactions.map((transaction) => TransferTransaction.fromJSON(transaction))),
      await Promise.all(input.nametags.map((token) => Token.fromJSON(token))),
    );
  }

  /**
   * Create token state from mint transaction, initial state and nametags. Also verify if state is
   * correct.
   *
   * @param trustBase   trust base for mint transaction verification
   * @param state       initial state
   * @param transaction mint transaction
   * @param nametags    nametags associated with transaction
   * @return token
   */
  public static async mint<R extends IMintTransactionReason>(
    trustBase: RootTrustBase,
    state: TokenState,
    transaction: MintTransaction<R>,
    nametags: Token<IMintTransactionReason>[] = [],
  ): Promise<Token<R>> {
    const token = new Token(state, transaction, [], nametags);
    const result = await token.verify(trustBase);
    if (!result.isSuccessful) {
      throw new VerificationError('Token verification failed', result);
    }

    return token;
  }

  /**
   * Update token to next state with given transfer transaction.
   *
   * @param trustBase   trust base to verify latest state
   * @param state       current state
   * @param transaction latest transaction
   * @param nametags    nametags associated with transaction
   * @return tokest with latest state
   */
  public async update(
    trustBase: RootTrustBase,
    state: TokenState,
    transaction: TransferTransaction,
    nametags: Token<IMintTransactionReason>[] = [],
  ): Promise<Token<R>> {
    let result = await transaction.verify(trustBase, this);

    if (!result.isSuccessful) {
      throw new VerificationError('Transaction verification failed', result);
    }

    const transactions = this._transactions.slice();
    transactions.push(transaction);

    const token = new Token(state, this.genesis, transactions, nametags);

    result = await token.verifyNametagTokens(trustBase);
    if (!result.isSuccessful) {
      throw new VerificationError('Nametag tokens verification failed', result);
    }

    result = await token.verifyRecipient();
    if (!result.isSuccessful) {
      throw new VerificationError('Recipient verification failed', result);
    }

    result = await token.verifyRecipientData();
    if (!result.isSuccessful) {
      throw new VerificationError('Recipient data verification failed', result);
    }

    return token;
  }

  /**
   * Verify current token state against trustbase.
   *
   * @param trustBase trust base to verify state against
   * @return verification result
   */
  public async verify(trustBase: RootTrustBase): Promise<VerificationResult> {
    const results: VerificationResult[] = [];
    results.push(VerificationResult.fromChildren('Genesis verification', [await this.genesis.verify(trustBase)]));

    for (let i = 0; i < this._transactions.length; i++) {
      const transaction = this._transactions[i];

      results.push(
        VerificationResult.fromChildren('Transaction verification', [
          await transaction.verify(
            trustBase,
            new Token(
              transaction.data.sourceState,
              this.genesis,
              this._transactions.slice(0, i),
              transaction.data.nametagTokens,
            ),
          ),
        ]),
      );
    }

    results.push(
      VerificationResult.fromChildren(
        'Current state verification',
        await Promise.all([this.verifyNametagTokens(trustBase), this.verifyRecipient(), this.verifyRecipientData()]),
      ),
    );

    return VerificationResult.fromChildren('Token verification', results);
  }

  public async verifyNametagTokens(trustBase: RootTrustBase): Promise<VerificationResult> {
    const results: VerificationResult[] = [];
    for (const nametagToken of this._nametagTokens) {
      results.push(await nametagToken.verify(trustBase));
    }

    return VerificationResult.fromChildren('Nametag verification', results);
  }

  public async verifyRecipient(): Promise<VerificationResult> {
    const predicate = await PredicateEngineService.createPredicate(this.state.predicate);
    const reference = await predicate.getReference();
    const expectedRecipient = await reference.toAddress();

    const previousTransaction = this._transactions.length
      ? (this._transactions.at(-1) as Transaction<TransferTransactionData>)
      : this.genesis;

    const transactionRecipient = await ProxyAddress.resolve(previousTransaction.data.recipient, this._nametagTokens);
    if (expectedRecipient.address !== transactionRecipient?.address) {
      return new VerificationResult(VerificationResultCode.FAIL, 'Recipient address mismatch');
    }

    return new VerificationResult(VerificationResultCode.OK, 'Recipient verification');
  }

  public async verifyRecipientData(): Promise<VerificationResult> {
    const previousTransaction = this._transactions.length
      ? (this._transactions.at(-1) as Transaction<TransferTransactionData>)
      : this.genesis;

    if (!(await previousTransaction.containsRecipientData(this.state.data))) {
      return new VerificationResult(
        VerificationResultCode.FAIL,
        'State data hash does not match previous transaction recipient data hash',
      );
    }

    return new VerificationResult(VerificationResultCode.OK, 'Recipient data verification');
  }

  /** Serialize this token to JSON. */
  public toJSON(): ITokenJson {
    return {
      genesis: this.genesis.toJSON(),
      nametags: this._nametagTokens.map((nametag) => nametag.toJSON()),
      state: this.state.toJSON(),
      transactions: this._transactions.map((transaction) => transaction.toJSON()),
      version: this.version,
    };
  }

  /** Serialize this token to CBOR. */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      CborSerializer.encodeTextString(this.version),
      this.state.toCBOR(),
      this.genesis.toCBOR(),
      CborSerializer.encodeArray(...this._transactions.map((transaction) => transaction.toCBOR())),
      CborSerializer.encodeArray(...this._nametagTokens.map((token) => token.toCBOR())),
    );
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
        Token[${this.version}]:
          State: 
            ${this.state.toString()}
          Genesis: 
            ${this.genesis.toString()}
          Transactions: [
            ${this._transactions.map((transition) => transition.toString()).join('\n')}
          ]
          Nametag Tokens: [ 
            ${this._nametagTokens.map((token) => token.toString()).join('\n')}
          ]
      `;
  }
}
