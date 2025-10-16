import { DefaultPredicate } from './DefaultPredicate.js';
import { EmbeddedPredicateType } from './EmbeddedPredicateType.js';
import { MaskedPredicateReference } from './MaskedPredicateReference.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborError } from '../../serializer/cbor/CborError.js';
import { SigningService } from '../../sign/SigningService.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenType } from '../../token/TokenType.js';

/**
 * Predicate for masked address transaction.
 */
export class MaskedPredicate extends DefaultPredicate {
  /**
   * @param tokenId    Token ID
   * @param tokenType  Token type
   * @param publicKey     Owner public key
   * @param algorithm     Transaction signing algorithm
   * @param hashAlgorithm Transaction hash algorithm
   * @param nonce         Nonce used in the predicate
   */
  public constructor(
    tokenId: TokenId,
    tokenType: TokenType,
    publicKey: Uint8Array,
    algorithm: string,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ) {
    super(EmbeddedPredicateType.MASKED, tokenId, tokenType, publicKey, algorithm, hashAlgorithm, nonce);
  }

  /**
   * Create masked predicate from signing service.
   *
   * @param tokenId        token id
   * @param tokenType      token type
   * @param signingService signing service
   * @param hashAlgorithm  hash algorithm
   * @param nonce          predicate nonce
   * @return predicate
   */
  public static create(
    tokenId: TokenId,
    tokenType: TokenType,
    signingService: SigningService,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): MaskedPredicate {
    return new MaskedPredicate(
      tokenId,
      tokenType,
      signingService.publicKey,
      signingService.algorithm,
      hashAlgorithm,
      nonce,
    );
  }

  public static fromCBOR(bytes: Uint8Array): MaskedPredicate {
    const data = CborDeserializer.readArray(bytes);

    const hashAlgorithm = CborDeserializer.readUnsignedInteger(data[4]);
    if (!HashAlgorithm[Number(hashAlgorithm)]) {
      throw new CborError('Invalid hash algorithm');
    }

    return new MaskedPredicate(
      TokenId.fromCBOR(data[0]),
      TokenType.fromCBOR(data[1]),
      CborDeserializer.readByteString(data[2]),
      CborDeserializer.readTextString(data[3]),
      Number(hashAlgorithm),
      CborDeserializer.readByteString(data[5]),
    );
  }

  /**
   * Convert predicate to CBOR bytes.
   *
   * @return CBOR bytes
   */
  public getReference(): Promise<MaskedPredicateReference> {
    return MaskedPredicateReference.create(
      this.tokenType,
      this.signingAlgorithm,
      this.publicKey,
      this.hashAlgorithm,
      this.nonce,
    );
  }
}
