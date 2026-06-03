import { TokenId } from '../transaction/TokenId.js';
import { HexConverter } from '../util/HexConverter.js';
import { DataHasher } from './hash/DataHasher.js';
import { HashAlgorithm } from './hash/HashAlgorithm.js';
import { SigningService } from './secp256k1/SigningService.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';

/**
 * Derives a deterministic {@link SigningService} for minting a token from the
 * token's {@link TokenId} and a fixed universal minter secret. The resulting
 * key is reproducible by anyone holding the same token id.
 */
export class MintSigningService {
  private static readonly MINTER_SECRET = HexConverter.decode('495f414d5f554e4956455253414c5f4d494e5445525f464f525f');

  /**
   * Create signing service for minting operations.
   *
   * @param {TokenId} tokenId Token identifier.
   * @returns {Promise<SigningService>} Signing service derived from the token id.
   */
  public static create(tokenId: TokenId): Promise<SigningService> {
    return new DataHasher(HashAlgorithm.SHA256)
      .update(
        CborSerializer.encodeArray(CborSerializer.encodeByteString(MintSigningService.MINTER_SECRET), tokenId.toCBOR()),
      )
      .digest()
      .then((hash) => new SigningService(hash.data));
  }
}
