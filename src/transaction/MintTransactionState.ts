import { TokenId } from './TokenId.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { DataHasher } from '../crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../crypto/hash/HashAlgorithm.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { HexConverter } from '../serialization/HexConverter.js';

/**
 * Token mint state.
 */
export class MintTransactionState extends DataHash {
  /**
   * Constant suffix used when deriving the mint initial state.
   * "TOKENID" SHA-256 hash
   */
  private static readonly MINT_SUFFIX: Uint8Array = HexConverter.decode(
    '9e82002c144d7c5796c50f6db50a0c7bbd7f717ae3af6c6c71a3e9eba3022730',
  );

  private constructor(hash: DataHash) {
    super(hash.algorithm, hash.data);
  }

  /**
   * Create token initial state from token id.
   *
   * @param {TokenId} tokenId token id
   * @return mint state
   */
  public static async create(tokenId: TokenId): Promise<MintTransactionState> {
    return new MintTransactionState(
      await new DataHasher(HashAlgorithm.SHA256)
        .update(
          CborSerializer.encodeArray(
            CborSerializer.encodeByteString(tokenId.bytes),
            CborSerializer.encodeByteString(MintTransactionState.MINT_SUFFIX),
          ),
        )
        .digest(),
    );
  }
}
