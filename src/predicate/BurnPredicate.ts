import { IPredicate } from './IPredicate.js';
import { PredicateType } from './PredicateType.js';
import { DataHash } from '../hash/DataHash.js';
import { DataHasher } from '../hash/DataHasher.js';
import { HashAlgorithm } from '../hash/HashAlgorithm.js';
import { CborDecoder } from '../serializer/cbor/CborDecoder.js';
import { CborEncoder } from '../serializer/cbor/CborEncoder.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';
import { HexConverter } from '../util/HexConverter.js';
import { dedent } from '../util/StringUtils.js';

const TYPE = PredicateType.BURN;

interface IPredicateJson {
  readonly type: PredicateType;
  readonly nonce: string;
  readonly reason: string;
}

/**
 * Predicate representing a permanently burned token.
 */
export class BurnPredicate implements IPredicate {
  public readonly type: PredicateType = TYPE;

  /**
   * @param reference  Reference hash identifying the predicate
   * @param hash       Unique hash of the predicate and token
   * @param _nonce     Nonce used to ensure uniqueness
   * @param reason     Reason for the burn
   */
  private constructor(
    public readonly reference: DataHash,
    public readonly hash: DataHash,
    private readonly _nonce: Uint8Array,
    public readonly reason: DataHash,
  ) {}

  /** @inheritDoc */
  public get nonce(): Uint8Array {
    return new Uint8Array(this._nonce);
  }

  /**
   * Create a new burn predicate.
   * @param tokenId Token ID for which the predicate is valid.
   * @param tokenType Type of the token.
   * @param nonce Nonce providing uniqueness for the predicate.
   * @param burnReason Burn reason for committing to the new tokens and coins being created after the burn.
   */
  public static async create(
    tokenId: TokenId,
    tokenType: TokenType,
    nonce: Uint8Array,
    burnReason: DataHash,
  ): Promise<BurnPredicate> {
    const reference = await BurnPredicate.calculateReference(tokenType, burnReason);
    const hash = await BurnPredicate.calculateHash(reference, tokenId, nonce);

    return new BurnPredicate(reference, hash, nonce, burnReason);
  }

  /**
   * Create a burn predicate from JSON data.
   * @param tokenId Token ID for which the predicate is valid.
   * @param tokenType Type of the token.
   * @param data JSON data representing the burn predicate.
   */
  public static fromJSON(tokenId: TokenId, tokenType: TokenType, data: unknown): Promise<BurnPredicate> {
    if (!BurnPredicate.isJSON(data)) {
      throw new Error('Invalid burn predicate json');
    }

    return BurnPredicate.create(tokenId, tokenType, HexConverter.decode(data.nonce), DataHash.fromJSON(data.reason));
  }

  public static fromCBOR(tokenId: TokenId, tokenType: TokenType, bytes: Uint8Array): Promise<BurnPredicate> {
    const data = CborDecoder.readArray(bytes);
    const type = CborDecoder.readTextString(data[0]);
    if (type !== PredicateType.BURN) {
      throw new Error(`Invalid predicate type: expected ${PredicateType.BURN}, got ${type}`);
    }

    return BurnPredicate.create(tokenId, tokenType, CborDecoder.readByteString(data[1]), DataHash.fromCBOR(data[2]));
  }

  /**
   * Calculate the reference hash for a burn predicate.
   * @param tokenType Type of the token for which the predicate is valid.
   * @param burnReason Reason for the burn
   */
  public static calculateReference(tokenType: TokenType, burnReason: DataHash): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(CborEncoder.encodeArray([CborEncoder.encodeTextString(TYPE), tokenType.toCBOR(), burnReason.toCBOR()]))
      .digest();
  }

  /**
   * Check if the provided data is a valid JSON representation of a burn predicate.
   * @param data Data to validate.
   */
  protected static isJSON(data: unknown): data is IPredicateJson {
    return (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === PredicateType.BURN &&
      'nonce' in data &&
      typeof data.nonce === 'string' &&
      'reason' in data &&
      typeof data.reason === 'string'
    );
  }

  /**
   * Compute the predicate hash for a specific token and nonce.
   * @param reference Reference hash of the predicate.
   * @param tokenId Token ID for which the predicate is valid.
   * @param nonce Nonce providing uniqueness for the predicate.
   * @private
   */
  private static calculateHash(reference: DataHash, tokenId: TokenId, nonce: Uint8Array): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(CborEncoder.encodeArray([reference.toCBOR(), tokenId.toCBOR(), CborEncoder.encodeByteString(nonce)]))
      .digest();
  }

  /** @inheritDoc */
  public toJSON(): IPredicateJson {
    return {
      nonce: HexConverter.encode(this._nonce),
      reason: this.reason.toJSON(),
      type: this.type,
    };
  }

  /** @inheritDoc */
  public toCBOR(): Uint8Array {
    return CborEncoder.encodeArray([
      CborEncoder.encodeTextString(this.type),
      CborEncoder.encodeByteString(this._nonce),
      this.reason.toCBOR(),
    ]);
  }

  /** @inheritDoc */
  public verify(): Promise<boolean> {
    return Promise.resolve(false);
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
          Predicate[${this.type}]:
            Hash: ${this.hash.toString()}`;
  }

  /** @inheritDoc */
  public isOwner(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
