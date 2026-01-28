import { AssetId } from '../asset/AssetId.js';

export class TokenAssetValueMismatchError extends Error {
  public constructor(assetId: AssetId, value: bigint, splitValue: bigint) {
    super(`Token contained ${value} ${assetId.toString()} assets, but tree has ${splitValue}`);
  }
}
