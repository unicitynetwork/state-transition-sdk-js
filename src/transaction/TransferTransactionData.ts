import { IMintTransactionReason } from './IMintTransactionReason.js';
import { AddressFactory } from '../address/AddressFactory.js';
import { IAddress } from '../address/IAddress.js';
import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { InvalidJsonStructureError } from '../InvalidJsonStructureError.js';
import { CborDeserializer } from '../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../serializer/cbor/CborSerializer.js';
import { ITokenJson, Token } from '../token/Token.js';
import { ITokenStateJson, TokenState } from '../token/TokenState.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

/** JSON representation of a {@link TransferTransactionData}. */
export interface ITransferTransactionDataJson {
  readonly sourceState: ITokenStateJson;
  readonly recipient: string;
  readonly salt: string;
  readonly recipientDataHash: string | null;
  readonly message: string | null;
  readonly nametags: ITokenJson[];
}

/**
 * Data describing a standard token transfer.
 */
export class TransferTransactionData {
  /**
   * @param sourceState       Previous token state
   * @param recipient         Address of the new owner
   * @param _salt             Salt for current transaction
   * @param recipientDataHash          Optional additional data hash
   * @param _message          Optional message bytes
   * @param _nametagTokens    Optional name tag tokens
   */
  private constructor(
    public readonly sourceState: TokenState,
    public readonly recipient: IAddress,
    private readonly _salt: Uint8Array,
    public readonly recipientDataHash: DataHash | null,
    private readonly _message: Uint8Array | null,
    private readonly _nametagTokens: Token<IMintTransactionReason>[] = [],
  ) {
    this._message = _message ? new Uint8Array(_message) : null;
    this._nametagTokens = Array.from(_nametagTokens);
  }

  /** Salt used for the transaction. */
  public get salt(): Uint8Array {
    return new Uint8Array(this._salt);
  }

  /** Optional message attached to the transfer. */
  public get message(): Uint8Array | null {
    return this._message ? new Uint8Array(this._message) : null;
  }

  /** Nametag tokens associated with this transaction. */
  public get nametagTokens(): Token<IMintTransactionReason>[] {
    return this._nametagTokens.slice();
  }

  public static create(
    sourceState: TokenState,
    recipient: IAddress,
    salt: Uint8Array,
    recipientDataHash: DataHash | null,
    message: Uint8Array | null,
    nametagTokens: Token<IMintTransactionReason>[] = [],
  ): TransferTransactionData {
    return new TransferTransactionData(sourceState, recipient, salt, recipientDataHash, message, nametagTokens);
  }

  /**
   * Create transfer transaction data from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return transfer transaction
   */
  public static async fromCBOR(bytes: Uint8Array): Promise<TransferTransactionData> {
    const data = CborDeserializer.readArray(bytes);

    return new TransferTransactionData(
      TokenState.fromCBOR(data[0]),
      await AddressFactory.createAddress(CborDeserializer.readTextString(data[1])),
      CborDeserializer.readByteString(data[2]),
      CborDeserializer.readOptional(data[3], DataHash.fromCBOR),
      CborDeserializer.readOptional(data[4], CborDeserializer.readByteString),
      await Promise.all(CborDeserializer.readArray(data[5]).map((token) => Token.fromCBOR(token))),
    );
  }

  public static isJSON(input: unknown): input is ITransferTransactionDataJson {
    return (
      typeof input === 'object' &&
      input !== null &&
      'sourceState' in input &&
      'recipient' in input &&
      'salt' in input &&
      'recipientDataHash' in input &&
      'message' in input &&
      'nametags' in input
    );
  }

  /**
   * Create transfer transaction data from JSON string.
   *
   * @param input JSON string
   * @return transfer transaction data
   */
  public static async fromJSON(input: unknown): Promise<TransferTransactionData> {
    if (!TransferTransactionData.isJSON(input)) {
      throw new InvalidJsonStructureError();
    }

    return new TransferTransactionData(
      TokenState.fromJSON(input.sourceState),
      await AddressFactory.createAddress(input.recipient),
      HexConverter.decode(input.salt),
      input.recipientDataHash ? DataHash.fromJSON(input.recipientDataHash) : null,
      input.message ? HexConverter.decode(input.message) : null,
      await Promise.all(input.nametags.map((token) => Token.fromJSON(token))),
    );
  }

  /**
   * Calculate transfer transaction data hash.
   *
   * @return transaction data hash
   */
  public calculateHash(): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256).update(this.toCBOR()).digest();
  }

  /**
   * Convert transfer transaction data to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(
      this.sourceState.toCBOR(),
      CborSerializer.encodeTextString(this.recipient.address),
      CborSerializer.encodeByteString(this.salt),
      CborSerializer.encodeOptional(this.recipientDataHash, (hash) => hash.toCBOR()),
      CborSerializer.encodeOptional(this.message, CborSerializer.encodeByteString),
      CborSerializer.encodeArray(...this.nametagTokens.map((token) => token.toCBOR())),
    );
  }

  /**
   * Convert transfer transaction data to JSON string.
   *
   * @return JSON string
   */
  public toJSON(): ITransferTransactionDataJson {
    return {
      message: this._message ? HexConverter.encode(this._message) : null,
      nametags: this._nametagTokens.map((token) => token.toJSON()),
      recipient: this.recipient.address,
      recipientDataHash: this.recipientDataHash?.toJSON() ?? null,
      salt: HexConverter.encode(this.salt),
      sourceState: this.sourceState.toJSON(),
    };
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
      TransactionData:
        ${this.sourceState.toString()}
        Recipient: ${this.recipient.toString()}
        Salt: ${HexConverter.encode(this._salt)}
        Data: ${this.recipientDataHash?.toString() ?? null}
        Message: ${this._message ? HexConverter.encode(this._message) : null}
        NameTags: [
          ${this._nametagTokens.map((token) => token.toString()).join('\n')}
        ]`;
  }
}
