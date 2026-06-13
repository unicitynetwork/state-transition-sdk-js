import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { SplitTokenRequest } from '../../../../src/payment/SplitTokenRequest.js';
import { TokenSplit } from '../../../../src/payment/TokenSplit.js';
import { createAsset, createPaymentAssets, createUser, parseSimplePaymentData } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

When(
  'Alice tries to split with values exceeding the original totals',
  async function (this: TokenWorld): Promise<void> {
    const requests = [
      SplitTokenRequest.create(
        createUser().predicate,
        createPaymentAssets(createAsset(this.assetId1, 60n), createAsset(this.assetId2, 120n)),
        this.token.type,
      ),
      SplitTokenRequest.create(
        createUser().predicate,
        createPaymentAssets(createAsset(this.assetId1, 50n), createAsset(this.assetId2, 100n)),
        this.token.type,
      ),
    ];

    try {
      await TokenSplit.split(this.token, parseSimplePaymentData, requests);
    } catch (e) {
      this.splitError = e as Error;
    }
  },
);

When(
  'Alice tries to split with values less than the original totals',
  async function (this: TokenWorld): Promise<void> {
    const requests = [
      SplitTokenRequest.create(
        createUser().predicate,
        createPaymentAssets(createAsset(this.assetId1, 30n), createAsset(this.assetId2, 60n)),
        this.token.type,
      ),
      SplitTokenRequest.create(
        createUser().predicate,
        createPaymentAssets(createAsset(this.assetId1, 30n), createAsset(this.assetId2, 60n)),
        this.token.type,
      ),
    ];

    try {
      await TokenSplit.split(this.token, parseSimplePaymentData, requests);
    } catch (e) {
      this.splitError = e as Error;
    }
  },
);

When(
  'Alice tries to split with minimum values of 1 and the remainder',
  async function (this: TokenWorld): Promise<void> {
    const requests = [
      SplitTokenRequest.create(
        createUser().predicate,
        createPaymentAssets(createAsset(this.assetId1, 1n), createAsset(this.assetId2, 1n)),
        this.token.type,
      ),
      SplitTokenRequest.create(
        createUser().predicate,
        createPaymentAssets(createAsset(this.assetId1, 99n), createAsset(this.assetId2, 199n)),
        this.token.type,
      ),
    ];

    try {
      await TokenSplit.split(this.token, parseSimplePaymentData, requests);
    } catch (e) {
      this.splitError = e as Error;
    }
  },
);

Then('the split validation succeeds', function (this: TokenWorld): void {
  assert.strictEqual(this.splitError, null);
});
