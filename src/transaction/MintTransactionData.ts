import { IMintTransactionReason } from './IMintTransactionReason.js';
import { MintTransactionState } from './MintTransactionState.js';
import { AddressFactory } from '../address/AddressFactory.js';
import { IAddress } from '../address/IAddress.js';
import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { SplitMintReason } from '../token/fungible/SplitMintReason.js';
import { TokenCoinData, TokenCoinDataJson } from '../token/fungible/TokenCoinData.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

const textEncoder = new TextEncoder();

export interface IMintTransactionDataJson {
  readonly tokenId: string;
  readonly tokenType: string;
  readonly tokenData: string | null;
  readonly coinData: TokenCoinDataJson | null;
  readonly recipient: string;
  readonly salt: string;
  readonly recipientDataHash: string | null;
  readonly reason: unknown | null;
}

/**
 * Data object describing a token mint operation.
 */
export class MintTransactionData<R extends IMintTransactionReason> {
  /**
   * @param tokenId     Token identifier
   * @param tokenType   Token type identifier
   * @param sourceState Mint transaction source state
   * @param _tokenData  Immutable token data used for the mint
   * @param coinData    Fungible coin data, or null if none
   * @param recipient   Address of the first owner
   * @param _salt       Random salt used to derive predicates
   * @param recipientDataHash    Optional metadata hash
   * @param reason      Optional reason object
   */
  private constructor(
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    public readonly sourceState: MintTransactionState,
    private readonly _tokenData: Uint8Array | null,
    public readonly coinData: TokenCoinData | null,
    public readonly recipient: IAddress,
    private readonly _salt: Uint8Array,
    public readonly recipientDataHash: DataHash | null,
    public readonly reason: R | null,
  ) {}

  /** Immutable token data used for the mint. */
  public get tokenData(): Uint8Array | null {
    return this._tokenData ? new Uint8Array(this._tokenData) : null;
  }

  /** Salt used during predicate creation. */
  public get salt(): Uint8Array {
    return new Uint8Array(this._salt);
  }

  public static async create<R extends IMintTransactionReason>(
    tokenId: TokenId,
    tokenType: TokenType,
    tokenData: Uint8Array | null,
    coinData: TokenCoinData | null,
    recipient: IAddress,
    salt: Uint8Array,
    recipientDataHash: DataHash | null,
    reason: R | null,
  ): Promise<MintTransactionData<R>> {
    const _tokenData = tokenData ? new Uint8Array(tokenData) : null;
    const _salt = new Uint8Array(salt);

    return new MintTransactionData(
      tokenId,
      tokenType,
      await MintTransactionState.create(tokenId),
      _tokenData,
      coinData,
      recipient,
      _salt,
      recipientDataHash,
      reason,
    );
  }

  public static async createFromNametag(
    name: string,
    tokenType: TokenType,
    recipient: IAddress,
    salt: Uint8Array,
    targetAddress: IAddress,
  ): Promise<MintTransactionData<IMintTransactionReason>> {
    return MintTransactionData.create(
      await TokenId.fromNameTag(name),
      tokenType,
      textEncoder.encode(targetAddress.address),
      null,
      recipient,
      salt,
      null,
      null,
    );
  }

  /**
   * Create mint transaction data from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return mint transaction data
   */
  public static async fromCBOR(bytes: Uint8Array): Promise<MintTransactionData<IMintTransactionReason>> {
    const data = CborDeserializer.readArray(bytes);

    return MintTransactionData.create(
      TokenId.fromCBOR(data[0]),
      TokenType.fromCBOR(data[1]),
      CborDeserializer.readOptional(data[2], CborDeserializer.readByteString),
      CborDeserializer.readOptional(data[3], TokenCoinData.fromCBOR),
      await AddressFactory.createAddress(CborDeserializer.readTextString(data[4])),
      CborDeserializer.readByteString(data[5]),
      CborDeserializer.readOptional(data[6], DataHash.fromCBOR),
      await CborDeserializer.readOptional(data[7], SplitMintReason.fromCBOR),
    );
  }

  public static isJSON(input: unknown): input is IMintTransactionDataJson {
    return (
      typeof input === 'object' &&
      input !== null &&
      'tokenId' in input &&
      'tokenType' in input &&
      'recipient' in input &&
      'salt' in input
    );
  }

  public static async fromJSON(input: unknown): Promise<MintTransactionData<IMintTransactionReason>> {
    if (!MintTransactionData.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return MintTransactionData.create(
      TokenId.fromJSON(input.tokenId),
      TokenType.fromJSON(input.tokenType),
      input.tokenData ? HexConverter.decode(input.tokenData) : null,
      input.coinData ? TokenCoinData.fromJSON(input.coinData) : null,
      await AddressFactory.createAddress(input.recipient),
      HexConverter.decode(input.salt),
      input.recipientDataHash ? DataHash.fromJSON(input.recipientDataHash) : null,
      input.reason ? await SplitMintReason.fromJSON(input.reason) : null,
    );
  }

  /**
   * Convert mint transaction data to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.tokenId.toCBOR(),
      this.tokenType.toCBOR(),
      CborSerializer.encodeOptional(this.tokenData, CborSerializer.encodeByteString),
      CborSerializer.encodeOptional(this.coinData, (coins) => coins.toCBOR()),
      CborSerializer.encodeTextString(this.recipient.address),
      CborSerializer.encodeByteString(this.salt),
      CborSerializer.encodeOptional(this.recipientDataHash, (hash) => hash.toCBOR()),
      CborSerializer.encodeOptional(this.reason, (reason) => reason!.toCBOR()),
    );
  }

  public toJSON(): IMintTransactionDataJson {
    return {
      coinData: this.coinData?.toJSON() ?? null,
      reason: this.reason?.toJSON() ?? null,
      recipient: this.recipient.address,
      recipientDataHash: this.recipientDataHash?.toJSON() ?? null,
      salt: HexConverter.encode(this.salt),
      tokenData: this.tokenData ? HexConverter.encode(this.tokenData) : null,
      tokenId: this.tokenId.toJSON(),
      tokenType: this.tokenType.toJSON(),
    };
  }

  /**
   * Calculate mint transaction hash.
   *
   * @return transaction hash.
   */
  public calculateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(this.toCBOR()).digest();
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
      MintTransactionData:
        Token ID: ${this.tokenId.toString()}
        Token Type: ${this.tokenType.toString()}
        Token Data: ${this._tokenData ? HexConverter.encode(this._tokenData) : null}
        Coins: ${this.coinData?.toString() ?? null}
        Recipient: ${this.recipient}
        Salt: ${HexConverter.encode(this.salt)}
        Data: ${this.recipientDataHash?.toString() ?? null}
        Reason: ${this.reason?.toString() ?? null}`;
  }
}
