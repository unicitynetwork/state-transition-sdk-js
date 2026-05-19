import { AssetId } from '../asset/AssetId.js';

/**
 * Thrown when a token split references an asset id that does not exist in
 * the source token's payment data.
 */
export class TokenAssetMissingError extends Error {
  public constructor(assetId: AssetId) {
    super(`Token did not contain asset ${assetId.toString()}.`);
  }
}
