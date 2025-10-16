import { EmbeddedPredicateType } from './EmbeddedPredicateType.js';
import { DirectAddress } from '../../address/DirectAddress.js';
import { DataHash } from '../../hash/DataHash.js';
import { DataHasher } from '../../hash/DataHasher.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { SigningService } from '../../sign/SigningService.js';
import { TokenType } from '../../token/TokenType.js';
import { IPredicateReference } from '../IPredicateReference.js';

export class UnmaskedPredicateReference implements IPredicateReference {
  private constructor(public readonly hash: DataHash) {}

  /**
   * Create predicate reference.
   *
   * @param tokenType        token type
   * @param signingAlgorithm signing algorithm
   * @param publicKey        predicate public key
   * @param hashAlgorithm    hash algorithm
   * @return predicate reference
   */
  public static async create(
    tokenType: TokenType,
    signingAlgorithm: string,
    publicKey: Uint8Array,
    hashAlgorithm: HashAlgorithm,
  ): Promise<UnmaskedPredicateReference> {
    return new UnmaskedPredicateReference(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(new Uint8Array([EmbeddedPredicateType.UNMASKED])),
            CborSerializer.encodeByteString(tokenType.toCBOR()),
            CborSerializer.encodeTextString(signingAlgorithm),
            CborSerializer.encodeUnsignedInteger(hashAlgorithm),
            CborSerializer.encodeByteString(publicKey),
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
   * @return predicate reference
   */
  public static createFromSigningService(
    tokenType: TokenType,
    signingService: SigningService,
    hashAlgorithm: HashAlgorithm,
  ): Promise<UnmaskedPredicateReference> {
    return UnmaskedPredicateReference.create(
      tokenType,
      signingService.algorithm,
      signingService.publicKey,
      hashAlgorithm,
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
