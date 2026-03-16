import { Given, When } from '@cucumber/cucumber';

import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { TokenSplit } from '../../../../src/payment/TokenSplit.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
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
    const splitTokenAssets: [TokenId, PaymentAssetCollection][] = [];

    for (let p = 0; p < splitCount; p++) {
      const tokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
      const assets = this.assetIds.map((assetId, assetIndex) => {
        const totalValue = BigInt((assetIndex + 1) * 100);
        const baseValue = totalValue / BigInt(splitCount);
        const remainder = totalValue % BigInt(splitCount);
        const value = p === 0 ? baseValue + remainder : baseValue;
        return createAsset(assetId, value);
      });
      splitTokenAssets.push([tokenId, createPaymentAssets(...assets)]);
    }

    try {
      await TokenSplit.split(this.token, this.alice.predicate, parseSimplePaymentData, splitTokenAssets);
    } catch (e) {
      this.splitError = e as Error;
    }
  },
);
