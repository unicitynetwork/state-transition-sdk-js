import { SigningService } from './SigningService.js';
import { TokenId } from '../token/TokenId.js';
import { HexConverter } from '../util/HexConverter.js';

/**
 * Signing service for minting operations.
 */
export class MintSigningService {
  private static readonly MINTER_SECRET = HexConverter.decode('495f414d5f554e4956455253414c5f4d494e5445525f464f525f');

  /**
   * Create signing service for minting operations.
   *
   * @param {TokenId} tokenId token identifier
   * @return signing service
   */
  public static create(tokenId: TokenId): Promise<SigningService> {
    return SigningService.createFromSecret(MintSigningService.MINTER_SECRET, tokenId.bytes);
  }
}
