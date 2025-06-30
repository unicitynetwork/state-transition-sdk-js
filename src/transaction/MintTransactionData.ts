import { RequestId } from '@unicitylabs/commons/lib/api/RequestId.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';
import { dedent } from '@unicitylabs/commons/lib/util/StringUtils.js';

import { ISerializable } from '../ISerializable.js';
import { TokenCoinData } from '../token/fungible/TokenCoinData.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

// TOKENID string SHA-256 hash
/**
 * Constant suffix used when deriving the mint initial state.
 */
const MINT_SUFFIX = HexConverter.decode('9e82002c144d7c5796c50f6db50a0c7bbd7f717ae3af6c6c71a3e9eba3022730');

/**
 * Data object describing a token mint operation.
 */
export class MintTransactionData<R extends ISerializable | null> {
  /**
   * @param hash        Hash of the encoded transaction
   * @param tokenId     Token identifier
   * @param tokenType   Token type identifier
   * @param _tokenData  Immutable token data used for the mint
   * @param coinData    Fungible coin data, or null if none
   * @param sourceState Pseudo input state used for the mint
   * @param recipient   Address of the first owner
   * @param _salt       Random salt used to derive predicates
   * @param dataHash    Optional metadata hash
   * @param reason      Optional reason object
   */
  private constructor(
    public readonly hash: DataHash,
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    private readonly _tokenData: Uint8Array,
    public readonly coinData: TokenCoinData | null,
    public readonly sourceState: RequestId,
    public readonly recipient: string,
    private readonly _salt: Uint8Array,
    public readonly dataHash: DataHash | null,
    public readonly reason: R,
  ) {
    this._tokenData = new Uint8Array(_tokenData);
    this._salt = new Uint8Array(_salt);
  }

  /** Immutable token data used for the mint. */
  public get tokenData(): Uint8Array {
    return new Uint8Array(this._tokenData);
  }

  /** Salt used during predicate creation. */
  public get salt(): Uint8Array {
    return new Uint8Array(this._salt);
  }

  /** Hash algorithm of the transaction hash. */
  public get hashAlgorithm(): HashAlgorithm {
    return this.hash.algorithm;
  }

  /**
   * Create a new mint transaction data object.
   * @param tokenId Token identifier
   * @param tokenType Token type identifier
   * @param tokenData Token data object
   * @param coinData Fungible coin data, or null if none
   * @param recipient Address of the first token owner
   * @param salt User selected salt
   * @param dataHash Hash pointing to next state data
   * @param reason Reason object attached to the mint
   */
  public static async create<R extends ISerializable | null>(
    tokenId: TokenId,
    tokenType: TokenType,
    tokenData: Uint8Array,
    coinData: TokenCoinData | null,
    recipient: string,
    salt: Uint8Array,
    dataHash: DataHash | null,
    reason: R,
  ): Promise<MintTransactionData<R>> {
    const sourceState = await RequestId.createFromImprint(tokenId.bytes, MINT_SUFFIX);
    const tokenDataHash = await new DataHasher(HashAlgorithm.SHA256).update(tokenData).digest();
    return new MintTransactionData(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborEncoder.encodeArray([
            tokenId.toCBOR(),
            tokenType.toCBOR(),
            tokenDataHash.toCBOR(),
            dataHash?.toCBOR() ?? CborEncoder.encodeNull(),
            coinData?.toCBOR() ?? CborEncoder.encodeNull(),
            CborEncoder.encodeTextString(recipient),
            CborEncoder.encodeByteString(salt),
            reason?.toCBOR() ?? CborEncoder.encodeNull(),
          ]),
        )
        .digest(),
      tokenId,
      tokenType,
      tokenData,
      coinData,
      sourceState,
      recipient,
      salt,
      dataHash,
      reason,
    );
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
      MintTransactionData:
        Token ID: ${this.tokenId.toString()}
        Token Type: ${this.tokenType.toString()}
        Token Data: ${HexConverter.encode(this._tokenData)}
        Coins: ${this.coinData?.toString() ?? null}
        Recipient: ${this.recipient}
        Salt: ${HexConverter.encode(this.salt)}
        Data: ${this.dataHash?.toString() ?? null}
        Reason: ${this.reason?.toString() ?? null}
        Hash: ${this.hash.toString()}`;
  }
}
