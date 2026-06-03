import { AssetId } from '../asset/AssetId.js';

/**
 * Thrown when a token split's asset sum tree root value does not match the
 * source token's recorded value for that asset.
 */
export class TokenAssetValueMismatchError extends Error {
  public constructor(assetId: AssetId, value: bigint, splitValue: bigint) {
    super(`Token contained ${value} ${assetId.toString()} assets, but tree has ${splitValue}`);
  }
}
