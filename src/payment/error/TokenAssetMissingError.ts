import { AssetId } from '../asset/AssetId.js';

export class TokenAssetMissingError extends Error {
  public constructor(assetId: AssetId) {
    super(`Token did not contain asset ${assetId.toString()}.`);
  }
}
