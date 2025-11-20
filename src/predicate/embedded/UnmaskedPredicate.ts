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
  public constructor(
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
   * @param tokenId        token id
   * @param tokenType      token type
   * @param signingService signing service
   * @param hashAlgorithm  hash algorithm
   * @param salt           received transaction salt
   */
  public static async create(
    tokenId: TokenId,
    tokenType: TokenType,
    signingService: SigningService,
    hashAlgorithm: HashAlgorithm,
    salt: Uint8Array,
  ): Promise<UnmaskedPredicate> {
    const nonce = await signingService.sign(await new DataHasher(HashAlgorithm.SHA256).update(salt).digest());

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
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          !token.transactions.length ? token.genesis.data.salt : (token.transactions.at(-1)?.data.salt as Uint8Array),
        )
        .digest(),
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
