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

const TYPE = PredicateType.MASKED;

/**
 * Predicate for masked address transaction.
 */
export class MaskedPredicate extends DefaultPredicate {
  /**
   * @param publicKey     Owner public key
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
   * Create a new masked predicate for the given owner.
   * @param tokenId token ID.
   * @param tokenType token type.
   * @param signingService Token owner's signing service.
   * @param hashAlgorithm Hash algorithm used to hash transaction.
   * @param nonce Nonce value used during creation, providing uniqueness.
   */
  public static create(
    tokenId: TokenId,
    tokenType: TokenType,
    signingService: ISigningService<ISignature>,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): Promise<MaskedPredicate> {
    return MaskedPredicate.createFromPublicKey(
      tokenId,
      tokenType,
      signingService.algorithm,
      signingService.publicKey,
      hashAlgorithm,
      nonce,
    );
  }

  public static async createFromPublicKey(
    tokenId: TokenId,
    tokenType: TokenType,
    signingAlgorithm: string,
    publicKey: Uint8Array,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): Promise<MaskedPredicate> {
    const reference = await MaskedPredicate.calculateReference(
      tokenType,
      signingAlgorithm,
      publicKey,
      hashAlgorithm,
      nonce,
    );
    const hash = await MaskedPredicate.calculateHash(reference, tokenId);

    return new MaskedPredicate(publicKey, signingAlgorithm, hashAlgorithm, nonce, reference, hash);
  }

  /**
   * Create a masked predicate from JSON data.
   * @param tokenId Token ID.
   * @param tokenType Token type.
   * @param data JSON data representing the masked predicate.
   */
  public static fromJSON(tokenId: TokenId, tokenType: TokenType, data: unknown): Promise<MaskedPredicate> {
    if (!DefaultPredicate.isJSON(data) || data.type !== TYPE) {
      throw new Error('Invalid masked predicate json.');
    }

    return MaskedPredicate.createFromPublicKey(
      tokenId,
      tokenType,
      data.algorithm,
      HexConverter.decode(data.publicKey),
      data.hashAlgorithm,
      HexConverter.decode(data.nonce),
    );
  }

  public static fromCBOR(tokenId: TokenId, tokenType: TokenType, bytes: Uint8Array): Promise<MaskedPredicate> {
    const data = CborDecoder.readArray(bytes);
    const type = CborDecoder.readTextString(data[0]);
    if (type !== PredicateType.MASKED) {
      throw new Error(`Invalid predicate type: expected ${PredicateType.MASKED}, got ${type}`);
    }

    const hashAlgorithm = Number(CborDecoder.readUnsignedInteger(data[3]));
    if (HashAlgorithm[hashAlgorithm] == null) {
      throw new Error(`Invalid hash algorithm: ${hashAlgorithm}`);
    }

    return MaskedPredicate.createFromPublicKey(
      tokenId,
      tokenType,
      CborDecoder.readTextString(data[2]),
      CborDecoder.readByteString(data[1]),
      hashAlgorithm,
      CborDecoder.readByteString(data[4]),
    );
  }

  /**
   * Compute the predicate reference.
   * @param tokenType token type.
   * @param algorithm Signing algorithm.
   * @param publicKey Owner's public key.
   * @param hashAlgorithm Hash algorithm used for signing.
   * @param nonce Nonce providing uniqueness for the predicate.
   */
  public static calculateReference(
    tokenType: TokenType,
    algorithm: string,
    publicKey: Uint8Array,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborEncoder.encodeArray([
          CborEncoder.encodeTextString(TYPE),
          tokenType.toCBOR(),
          CborEncoder.encodeTextString(algorithm),
          CborEncoder.encodeTextString(HashAlgorithm[hashAlgorithm]),
          CborEncoder.encodeByteString(publicKey),
          CborEncoder.encodeByteString(nonce),
        ]),
      )
      .digest();
  }

  /**
   * Compute the predicate hash for a specific token and nonce.
   * @param reference Reference hash of the predicate.
   * @param tokenId Token ID.
   * @private
   */
  private static calculateHash(reference: DataHash, tokenId: TokenId): Promise<DataHash> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(CborEncoder.encodeArray([reference.toCBOR(), tokenId.toCBOR()]))
      .digest();
  }
}
