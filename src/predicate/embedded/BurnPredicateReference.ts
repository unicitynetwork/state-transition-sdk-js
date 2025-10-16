import { EmbeddedPredicateType } from './EmbeddedPredicateType.js';
import { DirectAddress } from '../../address/DirectAddress.js';
import { DataHash } from '../../hash/DataHash.js';
import { DataHasher } from '../../hash/DataHasher.js';
import { HashAlgorithm } from '../../hash/HashAlgorithm.js';
import { CborSerializer } from '../../serializer/cbor/CborSerializer.js';
import { TokenType } from '../../token/TokenType.js';
import { IPredicateReference } from '../IPredicateReference.js';

/**
 * Burn predicate reference.
 */
export class BurnPredicateReference implements IPredicateReference {
  private constructor(public readonly hash: DataHash) {}

  /**
   * Create burn predicate reference.
   *
   * @param tokenType  token type
   * @param reason burn reason
   * @return predicate reference
   */
  public static async create(tokenType: TokenType, reason: DataHash): Promise<BurnPredicateReference> {
    return new BurnPredicateReference(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(new Uint8Array([EmbeddedPredicateType.BURN])),
            CborSerializer.encodeByteString(tokenType.toCBOR()),
            CborSerializer.encodeByteString(reason.imprint),
          ),
        )
        .digest(),
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
