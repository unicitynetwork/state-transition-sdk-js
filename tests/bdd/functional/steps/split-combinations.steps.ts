import { Given, When } from '@cucumber/cucumber';

import { SplitTokenRequest } from '../../../../src/payment/SplitTokenRequest.js';
import { TokenSplit } from '../../../../src/payment/TokenSplit.js';
import {
  createAsset,
  createAssetId,
  createPaymentAssets,
  createUser,
  mintTokenWithAssets,
  parseSimplePaymentData,
} from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

Given(
  /^Alice has a minted token containing (\d+) payment assets$/,
  async function (this: TokenWorld, assetCountStr: string): Promise<void> {
    const assetCount = parseInt(assetCountStr, 10);
    this.alice = createUser();
    this.assetIds = [];

    const assets = [];
    for (let i = 0; i < assetCount; i++) {
      const id = createAssetId();
      this.assetIds.push(id);
      assets.push(createAsset(id, BigInt((i + 1) * 100)));
    }

    this.token = await mintTokenWithAssets(this.setup, this.alice, createPaymentAssets(...assets));
  },
);

When(
  /^Alice splits the token into (\d+) equal parts$/,
  async function (this: TokenWorld, splitCountStr: string): Promise<void> {
    const splitCount = parseInt(splitCountStr, 10);
    const requests: SplitTokenRequest[] = [];

    for (let p = 0; p < splitCount; p++) {
      const assets = this.assetIds.map((assetId, assetIndex) => {
        const totalValue = BigInt((assetIndex + 1) * 100);
        const baseValue = totalValue / BigInt(splitCount);
        const remainder = totalValue % BigInt(splitCount);
        const value = p === 0 ? baseValue + remainder : baseValue;
        return createAsset(assetId, value);
      });
      requests.push(SplitTokenRequest.create(createUser().predicate, createPaymentAssets(...assets), this.token.type));
    }

    try {
      await TokenSplit.split(this.token, parseSimplePaymentData, requests);
    } catch (e) {
      this.splitError = e as Error;
    }
  },
);
