import { BurnPredicateReference } from './BurnPredicateReference.js';
import { EmbeddedPredicateType } from './EmbeddedPredicateType.js';
import { DataHash } from '../../hash/DataHash.js';
import { DataHasher } from '../../hash/DataHasher.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenType } from '../../token/TokenType.js';
import { dedent } from '../../util/StringUtils.js';
import { IPredicate } from '../IPredicate.js';
import { PredicateEngineType } from '../PredicateEngineType.js';

/**
 * Predicate representing a permanently burned token.
 */
export class BurnPredicate implements IPredicate {
  /**
   * @param tokenId   Token ID
   * @param tokenType Token type
   * @param reason     Reason for the burn
   */
  public constructor(
    public readonly tokenId: TokenId,
    public readonly tokenType: TokenType,
    public readonly reason: DataHash,
  ) {}

  public get engine(): PredicateEngineType {
    return PredicateEngineType.EMBEDDED;
  }

  public static fromCBOR(bytes: Uint8Array): BurnPredicate {
    const data = CborDeserializer.readArray(bytes);

    return new BurnPredicate(TokenId.fromCBOR(data[0]), TokenType.fromCBOR(data[1]), DataHash.fromCBOR(data[2]));
  }

  /** @inheritDoc */
  public verify(): Promise<boolean> {
    return Promise.resolve(false);
  }

  /** @inheritDoc */
  public isOwner(): Promise<boolean> {
    return Promise.resolve(false);
  }

  /** @inheritDoc */
  public getReference(): Promise<BurnPredicateReference> {
    return BurnPredicateReference.create(this.tokenType, this.reason);
  }

  /** @inheritDoc */
  public encode(): Uint8Array {
    return new Uint8Array([EmbeddedPredicateType.BURN]);
  }

  /** @inheritDoc */
  public encodeParameters(): Uint8Array {
    return CborSerializer.encodeArray(this.tokenId.toCBOR(), this.tokenType.toCBOR(), this.reason.toCBOR());
  }

  public async calculateHash(): Promise<DataHash> {
    const reference = await this.getReference();
    return new DataHasher(HashAlgorithm.SHA256)
      .update(CborSerializer.encodeArray(reference.hash.toCBOR(), this.tokenId.toCBOR()))
      .digest();
  }

  /** Convert instance to readable string */
  public toString(): string {
    return dedent`
          Predicate[${EmbeddedPredicateType[EmbeddedPredicateType.BURN]}]:
            TokenId: ${this.tokenId.toString()}
            TokenType: ${this.tokenType.toString()}
            Reason: ${this.reason.toString()}`;
  }
}
