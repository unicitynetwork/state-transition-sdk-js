import { RequestId } from '../api/RequestId.js';
import { DataHash } from '../hash/DataHash.js';
import { TokenId } from '../token/TokenId.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Token mint state.
 */
export class MintTransactionState extends DataHash {
  // TOKENID string SHA-256 hash
  /**
   * Constant suffix used when deriving the mint initial state.
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
    return new MintTransactionState(await RequestId.createFromImprint(tokenId.bytes, MintTransactionState.MINT_SUFFIX));
  }
}
