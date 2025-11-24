import { DefaultPredicate } from './DefaultPredicate.js';
import { EmbeddedPredicateType } from './EmbeddedPredicateType.js';
import { MaskedPredicateReference } from './MaskedPredicateReference.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborError } from '../../serializer/cbor/CborError.js';
import { SigningService } from '../../sign/SigningService.js';
import { Token } from '../../token/Token.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenType } from '../../token/TokenType.js';
import { MintTransaction } from '../../transaction/MintTransaction.js';

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
  private constructor(
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
   * Create masked predicate from token and signing service.
   *
   * @param {Token} token        token
   * @param {SigningService} signingService signing service
   * @param {HashAlgorithm} hashAlgorithm  hash algorithm
   * @param {Uint8Array} nonce          predicate nonce
   * @return predicate
   */
  public static createFromToken(
    token: Token,
    signingService: SigningService,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): MaskedPredicate {
    return MaskedPredicate.createFromMintTransaction(token.genesis, signingService, hashAlgorithm, nonce);
  }

  /**
   * Create masked predicate from mint transaction and signing service.
   *
   * @param {MintTransaction} transaction        mint transaction
   * @param {SigningService} signingService signing service
   * @param {HashAlgorithm} hashAlgorithm  hash algorithm
   * @param {Uint8Array} nonce          predicate nonce
   * @return predicate
   */
  public static createFromMintTransaction(
    transaction: MintTransaction,
    signingService: SigningService,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): MaskedPredicate {
    return new MaskedPredicate(
      transaction.data.tokenId,
      transaction.data.tokenType,
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
