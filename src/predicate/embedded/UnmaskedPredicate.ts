import { DefaultPredicate } from './DefaultPredicate.js';
import { EmbeddedPredicateType } from './EmbeddedPredicateType.js';
import { UnmaskedPredicateReference } from './UnmaskedPredicateReference.js';
import { RootTrustBase } from '../../bft/RootTrustBase.js';
import { DataHasher } from '../../hash/DataHasher.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { CborDeserializer } from '../../serializer/cbor/CborDeserializer.js';
import { CborError } from '../../serializer/cbor/CborError.js';
import { SigningService } from '../../sign/SigningService.js';
import { Token } from '../../token/Token.js';
import { TokenId } from '../../token/TokenId.js';
import { TokenType } from '../../token/TokenType.js';
import { MintTransaction } from '../../transaction/MintTransaction.js';
import { TransferTransaction } from '../../transaction/TransferTransaction.js';

/**
 * Predicate for public address transaction.
 */
export class UnmaskedPredicate extends DefaultPredicate {
  /**
   * @param tokenId    Token ID
   * @param tokenType  Token type
   * @param publicKey     Owner public key.
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
    super(EmbeddedPredicateType.UNMASKED, tokenId, tokenType, publicKey, algorithm, hashAlgorithm, nonce);
  }

  /**
   * Create unmasked predicate.
   *
   * @param {Token} token        token
   * @param {SigningService} signingService signing service
   * @param {HashAlgorithm} hashAlgorithm  hash algorithm
   */
  public static createFromToken(
    token: Token,
    signingService: SigningService,
    hashAlgorithm: HashAlgorithm,
  ): Promise<UnmaskedPredicate> {
    return UnmaskedPredicate.create(token.id, token.type, token.latestTransaction, signingService, hashAlgorithm);
  }

  /**
   * Create unmasked predicate from mint transaction.
   *
   * @param {MintTransaction} transaction        mint transaction
   * @param {SigningService} signingService signing service
   * @param {HashAlgorithm} hashAlgorithm  hash algorithm
   * @return predicate
   */
  public static createFromMintTransaction(
    transaction: MintTransaction,
    signingService: SigningService,
    hashAlgorithm: HashAlgorithm,
  ): Promise<UnmaskedPredicate> {
    return UnmaskedPredicate.create(
      transaction.data.tokenId,
      transaction.data.tokenType,
      transaction,
      signingService,
      hashAlgorithm,
    );
  }

  /**
   * Create predicate from CBOR bytes.
   *
   * @param bytes CBOR bytes
   * @return predicate
   */
  public static fromCBOR(bytes: Uint8Array): UnmaskedPredicate {
    const data = CborDeserializer.readArray(bytes);

    const hashAlgorithm = CborDeserializer.readUnsignedInteger(data[4]);
    if (!HashAlgorithm[Number(hashAlgorithm)]) {
      throw new CborError('Invalid hash algorithm');
    }

    return new UnmaskedPredicate(
      TokenId.fromCBOR(data[0]),
      TokenType.fromCBOR(data[1]),
      CborDeserializer.readByteString(data[2]),
      CborDeserializer.readTextString(data[3]),
      Number(hashAlgorithm),
      CborDeserializer.readByteString(data[5]),
    );
  }

  /**
   * Create unmasked predicate.
   *
   * @param {TokenId} tokenId        token id
   * @param {TokenType} tokenType        token type
   * @param {MintTransaction | TransferTransaction} transaction        transaction
   * @param {SigningService} signingService signing service
   * @param {HashAlgorithm} hashAlgorithm  hash algorithm
   */
  private static async create(
    tokenId: TokenId,
    tokenType: TokenType,
    transaction: MintTransaction | TransferTransaction,
    signingService: SigningService,
    hashAlgorithm: HashAlgorithm,
  ): Promise<UnmaskedPredicate> {
    const nonce = await signingService.sign(
      await new DataHasher(HashAlgorithm.SHA256).update(transaction.data.salt).digest(),
    );

    return new UnmaskedPredicate(
      tokenId,
      tokenType,
      signingService.publicKey,
      signingService.algorithm,
      hashAlgorithm,
      nonce.bytes,
    );
  }

  /**
   * Verify token state for current transaction.
   *
   * @param trustBase   trust base to verify against.
   * @param token       current token state
   * @param transaction current transaction
   * @return true if successful
   */
  public async verify(trustBase: RootTrustBase, token: Token, transaction: TransferTransaction): Promise<boolean> {
    if (!(await super.verify(trustBase, token, transaction))) {
      return false;
    }

    return SigningService.verifyWithPublicKey(
      await new DataHasher(HashAlgorithm.SHA256).update(token.latestTransaction.data.salt).digest(),
      this.nonce,
      this.publicKey,
    );
  }

  /**
   * @inheritDoc
   */
  public getReference(): Promise<UnmaskedPredicateReference> {
    return UnmaskedPredicateReference.create(this.tokenType, this.signingAlgorithm, this.publicKey, this.hashAlgorithm);
  }
}
