import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { TokenSplit } from '../../../../src/payment/TokenSplit.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { createAsset, createPaymentAssets, parseSimplePaymentData } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

When(
  'Alice tries to split with values exceeding the original totals',
  async function (this: TokenWorld): Promise<void> {
    const tokenId1 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
    const tokenId2 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));

    try {
      await TokenSplit.split(this.token, this.alice.predicate, parseSimplePaymentData, [
        [tokenId1, createPaymentAssets(createAsset(this.assetId1, 60n), createAsset(this.assetId2, 120n))],
        [tokenId2, createPaymentAssets(createAsset(this.assetId1, 50n), createAsset(this.assetId2, 100n))],
      ]);
    } catch (e) {
      this.splitError = e as Error;
    }
  },
);

When(
  'Alice tries to split with values less than the original totals',
  async function (this: TokenWorld): Promise<void> {
    const tokenId1 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
    const tokenId2 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));

    try {
      await TokenSplit.split(this.token, this.alice.predicate, parseSimplePaymentData, [
        [tokenId1, createPaymentAssets(createAsset(this.assetId1, 30n), createAsset(this.assetId2, 60n))],
        [tokenId2, createPaymentAssets(createAsset(this.assetId1, 30n), createAsset(this.assetId2, 60n))],
      ]);
    } catch (e) {
      this.splitError = e as Error;
    }
  },
);

When(
  'Alice tries to split with minimum values of 1 and the remainder',
  async function (this: TokenWorld): Promise<void> {
    const tokenId1 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
    const tokenId2 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));

    try {
      await TokenSplit.split(this.token, this.alice.predicate, parseSimplePaymentData, [
        [tokenId1, createPaymentAssets(createAsset(this.assetId1, 1n), createAsset(this.assetId2, 1n))],
        [tokenId2, createPaymentAssets(createAsset(this.assetId1, 99n), createAsset(this.assetId2, 199n))],
      ]);
    } catch (e) {
      this.splitError = e as Error;
    }
  },
);

Then('the split validation succeeds', function (this: TokenWorld): void {
  assert.strictEqual(this.splitError, null);
});
