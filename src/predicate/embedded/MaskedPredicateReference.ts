import { EmbeddedPredicateType } from './EmbeddedPredicateType.js';
import { DirectAddress } from '../../address/DirectAddress.js';
import { DataHash } from '../../hash/DataHash.js';
import { DataHasher } from '../../hash/DataHasher.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { SigningService } from '../../sign/SigningService.js';
import { TokenType } from '../../token/TokenType.js';
import { IPredicateReference } from '../IPredicateReference.js';

export class MaskedPredicateReference implements IPredicateReference {
  private constructor(public readonly hash: DataHash) {}

  /**
   * Create predicate reference.
   *
   * @param tokenType        token type
   * @param signingAlgorithm signing algorithm
   * @param publicKey        predicate public key
   * @param hashAlgorithm    hash algorithm
   * @param nonce        nonce
   * @return predicate reference
   */
  public static async create(
    tokenType: TokenType,
    signingAlgorithm: string,
    publicKey: Uint8Array,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): Promise<MaskedPredicateReference> {
    return new MaskedPredicateReference(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(new Uint8Array([EmbeddedPredicateType.MASKED])),
            CborSerializer.encodeByteString(tokenType.toCBOR()),
            CborSerializer.encodeTextString(signingAlgorithm),
            CborSerializer.encodeUnsignedInteger(hashAlgorithm),
            CborSerializer.encodeByteString(publicKey),
            CborSerializer.encodeByteString(nonce),
          ),
        )
        .digest(),
    );
  }

  /**
   * Create predicate reference from signing service.
   *
   * @param tokenType      token type
   * @param signingService signing service
   * @param hashAlgorithm  hash algorithm
   * @param nonce       nonce
   * @return predicate reference
   */
  public static createFromSigningService(
    tokenType: TokenType,
    signingService: SigningService,
    hashAlgorithm: HashAlgorithm,
    nonce: Uint8Array,
  ): Promise<MaskedPredicateReference> {
    return MaskedPredicateReference.create(
      tokenType,
      signingService.algorithm,
      signingService.publicKey,
      hashAlgorithm,
      nonce,
    );
  }

  /**
   * Convert predicate reference to address.
   *
   * @return predicate address
   */
  public toAddress(): Promise<DirectAddress> {
    return DirectAddress.create(this.hash);
  }
}
