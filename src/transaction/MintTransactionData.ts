import { IMintTransactionReason } from './IMintTransactionReason.js';
import { MintReasonFactory } from './MintReasonFactory.js';
import { MintTransactionState } from './MintTransactionState.js';
import { ReasonTypeId } from './ReasonTypeId.js';
import { AddressFactory } from '../address/AddressFactory.js';
import { IAddress } from '../address/IAddress.js';
import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { TokenCoinData, TokenCoinDataJson } from '../token/fungible/TokenCoinData.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

const textEncoder = new TextEncoder();

export interface IMintTransactionDataJson {
  readonly coinData: TokenCoinDataJson | null;
  readonly reasons: { [typeIdHex: string]: unknown } | null;
  readonly recipient: string;
  readonly recipientDataHash: string | null;
  readonly salt: string;
  readonly tokenData: string | null;
  readonly tokenId: string;
  readonly tokenType: string;
}

/**
 * Data object describing a token mint operation.
 */
export class MintTransactionData {
  /**
   * @param tokenId     Token identifier
   * @param tokenType   Token type identifier
   * @param sourceState Mint transaction source state
   * @param _tokenData  Immutable token data used for the mint
   * @param coinData    Fungible coin data, or null if none
   * @param recipient   Address of the first owner
   * @param _salt       Random salt used to derive predicates
   * @param recipientDataHash    Optional metadata hash
   * @param reasons     Map of reason type IDs to reason objects
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
    public readonly reasons: Map<string, IMintTransactionReason> | null,
  ) {}

  /** Immutable token data used for the mint. */
  public get tokenData(): Uint8Array | null {
    return this._tokenData ? new Uint8Array(this._tokenData) : null;
  }

  /** Salt used during predicate creation. */
  public get salt(): Uint8Array {
    return new Uint8Array(this._salt);
  }

  public static async create(
    tokenId: TokenId,
    tokenType: TokenType,
    tokenData: Uint8Array | null,
    coinData: TokenCoinData | null,
    recipient: IAddress,
    salt: Uint8Array,
    recipientDataHash: DataHash | null,
    reasons: Map<string, IMintTransactionReason> | null,
  ): Promise<MintTransactionData> {
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
      reasons,
    );
  }

  public static async createFromNametag(
    name: string,
    tokenType: TokenType,
    recipient: IAddress,
    salt: Uint8Array,
    targetAddress: IAddress,
  ): Promise<MintTransactionData> {
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
  public static async fromCBOR(bytes: Uint8Array): Promise<MintTransactionData> {
    const data = CborDeserializer.readArray(bytes);

    // Deserialize reasons using factory
    const reasonsArray = data[7] ? CborDeserializer.readArray(data[7]) : null;
    const reasons = reasonsArray
      ? new Map(
          await Promise.all(
            reasonsArray.map(async (entry) => {
              const [typeIdBytes, reasonBytes] = CborDeserializer.readArray(entry);
              const typeId = ReasonTypeId.fromCBOR(typeIdBytes);
              const reason = await MintReasonFactory.fromCBOR(typeId, reasonBytes);
              return [typeId.toHexString(), reason] as [string, IMintTransactionReason];
            }),
          ),
        )
      : null;

    return MintTransactionData.create(
      TokenId.fromCBOR(data[0]),
      TokenType.fromCBOR(data[1]),
      CborDeserializer.readOptional(data[2], CborDeserializer.readByteString),
      CborDeserializer.readOptional(data[3], TokenCoinData.fromCBOR),
      await AddressFactory.createAddress(CborDeserializer.readTextString(data[4])),
      CborDeserializer.readByteString(data[5]),
      CborDeserializer.readOptional(data[6], DataHash.fromCBOR),
      reasons,
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

  public static async fromJSON(input: unknown): Promise<MintTransactionData> {
    if (!MintTransactionData.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    // Deserialize reasons using factory
    const reasons = input.reasons
      ? new Map(
          await Promise.all(
            Object.entries(input.reasons).map(async ([typeIdHex, reasonJson]) => {
              const reason = await MintReasonFactory.fromJSON(typeIdHex, reasonJson);
              return [typeIdHex, reason] as [string, IMintTransactionReason];
            }),
          ),
        )
      : null;

    return MintTransactionData.create(
      TokenId.fromJSON(input.tokenId),
      TokenType.fromJSON(input.tokenType),
      input.tokenData ? HexConverter.decode(input.tokenData) : null,
      input.coinData ? TokenCoinData.fromJSON(input.coinData) : null,
      await AddressFactory.createAddress(input.recipient),
      HexConverter.decode(input.salt),
      input.recipientDataHash ? DataHash.fromJSON(input.recipientDataHash) : null,
      reasons,
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
      CborSerializer.encodeOptional(
        this.reasons,
        (reasons) =>
          CborSerializer.encodeArray(
            ...Array.from(reasons.entries()).map(([typeIdHex, reason]) =>
              CborSerializer.encodeArray(
                CborSerializer.encodeByteString(ReasonTypeId.fromJSON(typeIdHex).toBytes()),
                reason.toCBOR(),
              ),
            ),
          ),
      ),
    );
  }

  public toJSON(): IMintTransactionDataJson {
    return {
      coinData: this.coinData?.toJSON() ?? null,
      reasons: this.reasons
        ? Object.fromEntries(Array.from(this.reasons.entries()).map(([typeIdHex, reason]) => [typeIdHex, reason.toJSON()]))
        : null,
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
   * Note: Reasons are EXCLUDED from the hash calculation.
   *
   * @return transaction hash.
   */
  public calculateHash(): Promise<DataHash> {
    // Encode only the first 7 fields (excluding reasons) for hash calculation
    const hashData = CborSerializer.encodeArray(
      this.tokenId.toCBOR(),
      this.tokenType.toCBOR(),
      CborSerializer.encodeOptional(this.tokenData, CborSerializer.encodeByteString),
      CborSerializer.encodeOptional(this.coinData, (coins) => coins.toCBOR()),
      CborSerializer.encodeTextString(this.recipient.address),
      CborSerializer.encodeByteString(this.salt),
      CborSerializer.encodeOptional(this.recipientDataHash, (hash) => hash.toCBOR()),
    );
    return new DataHasher(HashAlgorithm.SHA256).update(hashData).digest();
  }

  /** Convert instance to readable string */
  public toString(): string {
    const reasonsStr = this.reasons
      ? Array.from(this.reasons.entries())
          .map(([typeId, reason]) => `${typeId}: ${reason.toString()}`)
          .join(', ')
      : null;
    return dedent`
      MintTransactionData:
        Token ID: ${this.tokenId.toString()}
        Token Type: ${this.tokenType.toString()}
        Token Data: ${this._tokenData ? HexConverter.encode(this._tokenData) : null}
        Coins: ${this.coinData?.toString() ?? null}
        Recipient: ${this.recipient}
        Salt: ${HexConverter.encode(this.salt)}
        Data: ${this.recipientDataHash?.toString() ?? null}
        Reasons: ${reasonsStr}`;
  }
}
