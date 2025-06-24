import { CborDecoder } from '@unicitylabs/commons/lib/cbor/CborDecoder.js';
import { CborEncoder } from '@unicitylabs/commons/lib/cbor/CborEncoder.js';
import { DataHash } from '@unicitylabs/commons/lib/hash/DataHash.js';
import { DataHasher } from '@unicitylabs/commons/lib/hash/DataHasher.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import type { ISignature } from '@unicitylabs/commons/lib/signing/ISignature.js';
import type { ISigningService } from '@unicitylabs/commons/lib/signing/ISigningService.js';
import { HexConverter } from '@unicitylabs/commons/lib/util/HexConverter.js';

import { DefaultPredicate } from './DefaultPredicate.js';
import { PredicateType } from './PredicateType.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

const TYPE = PredicateType.UNMASKED;

/**
 * Predicate for public address transaction.
 */
export class UnmaskedPredicate extends DefaultPredicate {
  /**
   * @param publicKey     Owner public key.
   * @param algorithm     Transaction signing algorithm
   * @param hashAlgorithm Transaction hash algorithm
   * @param nonce         Nonce used in the predicate
   * @param reference     Predicate reference
   * @param hash          Predicate hash
   */
  private constructor(
    publicKey: Uint8Array,
    algorithm: string,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
    reference: DataHash,
    hash: DataHash,
  ) {
    super(TYPE, publicKey, algorithm, hashAlgorithm, nonce, reference, hash);
  }

  /**
   * Create a new unmasked predicate for the given owner.
   * @param tokenId Token ID
   * @param tokenType Token type
   * @param signingService Token owner's signing service
   * @param hashAlgorithm Hash algorithm used to hash transaction
   * @param salt Transaction salt
   */
  public static async create(
    tokenId: TokenId,
    tokenType: TokenType,
    signingService: ISigningService<ISignature>,
    hashAlgorithm: HashAlgorithm,
    salt: Uint8Array,
  ): Promise<UnmaskedPredicate> {
    const saltHash = await new DataHasher(HashAlgorithm.SHA256).update(salt).digest();
    const nonce = await signingService.sign(saltHash);

    return UnmaskedPredicate.createFromPublicKey(
      tokenId,
      tokenType,
      signingService.algorithm,
      signingService.publicKey,
      hashAlgorithm,
      nonce.bytes,
    );
  }

  public static async createFromPublicKey(
    tokenId: TokenId,
    tokenType: TokenType,
    signingAlgorithm: string,
    publicKey: Uint8Array,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): Promise<UnmaskedPredicate> {
    const reference = await UnmaskedPredicate.calculateReference(tokenType, signingAlgorithm, publicKey, hashAlgorithm);
    const hash = await UnmaskedPredicate.calculateHash(reference, tokenId, nonce);

    return new UnmaskedPredicate(publicKey, signingAlgorithm, hashAlgorithm, nonce, reference, hash);
  }

  /**
   * Create a masked predicate from JSON data.
   * @param tokenId Token ID.
   * @param tokenType Token type.
   * @param data JSON data representing the masked predicate.
   */
  public static fromJSON(tokenId: TokenId, tokenType: TokenType, data: unknown): Promise<UnmaskedPredicate> {
    if (!DefaultPredicate.isJSON(data) || data.type !== TYPE) {
      throw new Error('Invalid unmasked predicate json.');
    }

    return UnmaskedPredicate.createFromPublicKey(
      tokenId,
      tokenType,
      data.algorithm,
      HexConverter.decode(data.publicKey),
      data.hashAlgorithm,
      HexConverter.decode(data.nonce),
    );
  }

  public static fromCBOR(tokenId: TokenId, tokenType: TokenType, bytes: Uint8Array): Promise<UnmaskedPredicate> {
    const data = CborDecoder.readArray(bytes);
    const type = CborDecoder.readTextString(data[0]);
    if (type !== PredicateType.UNMASKED) {
      throw new Error(`Invalid predicate type: expected ${PredicateType.UNMASKED}, got ${type}`);
    }

    const hashAlgorithm = CborDecoder.readTextString(data[3]) as unknown as HashAlgorithm;
    if (!HashAlgorithm[hashAlgorithm]) {
      throw new Error(`Invalid hash algorithm: ${hashAlgorithm}`);
    }

    return UnmaskedPredicate.createFromPublicKey(
      tokenId,
      tokenType,
      CborDecoder.readTextString(data[2]),
      CborDecoder.readByteString(data[1]),
      hashAlgorithm,
      CborDecoder.readByteString(data[4]),
    );
  }

  /**
   * Calculate the predicate reference.
   * @param tokenType Token type
   * @param algorithm Signing algorithm
   * @param publicKey Owner public key
   * @param hashAlgorithm Hash algorithm used to hash transaction
   */
  public static calculateReference(
    tokenType: TokenType,
    algorithm: string,
    publicKey: Uint8Array,
    hashAlgorithm: HashAlgorithm,
  ): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborEncoder.encodeArray([
          CborEncoder.encodeTextString(TYPE),
          tokenType.toCBOR(),
          CborEncoder.encodeTextString(algorithm),
          CborEncoder.encodeTextString(HashAlgorithm[hashAlgorithm]),
          CborEncoder.encodeByteString(publicKey),
        ]),
      )
      .digest();
  }

  /**
   * Calculate the predicate hash.
   * @param reference Reference of the predicate
   * @param tokenId Token ID
   * @param nonce Nonce used in the predicate
   * @private
   */
  private static calculateHash(reference: DataHash, tokenId: TokenId, nonce: Uint8Array): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(CborEncoder.encodeArray([reference.toCBOR(), tokenId.toCBOR(), CborEncoder.encodeByteString(nonce)]))
      .digest();
  }
}
