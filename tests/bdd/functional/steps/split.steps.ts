import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { Asset } from '../../../../src/payment/asset/Asset.js';
import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { TokenAssetCountMismatchError } from '../../../../src/payment/error/TokenAssetCountMismatchError.js';
import { TokenAssetMissingError } from '../../../../src/payment/error/TokenAssetMissingError.js';
import { TokenAssetValueMismatchError } from '../../../../src/payment/error/TokenAssetValueMismatchError.js';
import { ISplitPaymentData } from '../../../../src/payment/ISplitPaymentData.js';
import { SplitReason } from '../../../../src/payment/SplitReason.js';
import { TokenSplit } from '../../../../src/payment/TokenSplit.js';
import { CborDeserializer } from '../../../../src/serialization/cbor/CborDeserializer.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import {
  createAssetId,
  createUser,
  mintTokenWithAssets,
  parseSimplePaymentData,
  splitToken,
} from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

Given('Alice has a minted token with 2 payment assets', async function (this: TokenWorld): Promise<void> {
  this.alice = createUser();
  this.assetId1 = createAssetId();
  this.assetId2 = createAssetId();
  this.tokens = PaymentAssetCollection.create(new Asset(this.assetId1, 100n), new Asset(this.assetId2, 200n));
  this.token = await mintTokenWithAssets(this.setup, this.alice, this.tokens);
});

When('Alice splits the token into 2 new tokens', async function (this: TokenWorld): Promise<void> {
  const splitTokenId1 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const splitTokenId2 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));

  const splitAssets: [TokenId, PaymentAssetCollection][] = [
    [splitTokenId1, PaymentAssetCollection.create(new Asset(this.assetId1, 60n), new Asset(this.assetId2, 120n))],
    [splitTokenId2, PaymentAssetCollection.create(new Asset(this.assetId1, 40n), new Asset(this.assetId2, 80n))],
  ];

  const result = await splitToken(
    this.setup,
    this.token,
    this.alice.predicate,
    this.alice.signingService,
    splitAssets,
    parseSimplePaymentData,
  );

  this.burnedToken = result.burnedToken;
  this.splitTokens = result.splitTokens;
});

When('Alice tries to split with only 1 asset instead of 2', async function (this: TokenWorld): Promise<void> {
  const splitTokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const splitAssets: [TokenId, PaymentAssetCollection][] = [
    [splitTokenId, PaymentAssetCollection.create(new Asset(this.assetId1, 100n))],
  ];

  try {
    await TokenSplit.split(this.token, this.alice.predicate, parseSimplePaymentData, splitAssets);
  } catch (e) {
    this.splitError = e as Error;
  }
});

When('Alice tries to split with a wrong asset ID', async function (this: TokenWorld): Promise<void> {
  const splitTokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const wrongAssetId = createAssetId();
  const splitAssets: [TokenId, PaymentAssetCollection][] = [
    [splitTokenId, PaymentAssetCollection.create(new Asset(this.assetId1, 100n), new Asset(wrongAssetId, 200n))],
  ];

  try {
    await TokenSplit.split(this.token, this.alice.predicate, parseSimplePaymentData, splitAssets);
  } catch (e) {
    this.splitError = e as Error;
  }
});

When('Alice tries to split with incorrect asset values', async function (this: TokenWorld): Promise<void> {
  const splitTokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const splitAssets: [TokenId, PaymentAssetCollection][] = [
    [splitTokenId, PaymentAssetCollection.create(new Asset(this.assetId1, 50n), new Asset(this.assetId2, 200n))],
  ];

  try {
    await TokenSplit.split(this.token, this.alice.predicate, parseSimplePaymentData, splitAssets);
  } catch (e) {
    this.splitError = e as Error;
  }
});

Then('the burn transaction succeeds', function (this: TokenWorld): void {
  assert.ok(this.burnedToken !== undefined);
  assert.ok(this.burnedToken.transactions.length > 0);
});

Then('2 split tokens are minted', function (this: TokenWorld): void {
  assert.strictEqual(this.splitTokens.length, 2);
});

Then('each split token passes TokenSplit verification', async function (this: TokenWorld): Promise<void> {
  for (const splitTok of this.splitTokens) {
    const parseSplitPaymentData = async (bytes: Uint8Array): Promise<ISplitPaymentData> => {
      const data = CborDeserializer.decodeArray(bytes);
      const splitAssets = PaymentAssetCollection.fromCBOR(data[0]);
      const reason = await SplitReason.fromCBOR(data[1]);
      return { assets: splitAssets, encode: () => Promise.resolve(bytes), reason };
    };

    const result = await TokenSplit.verify(
      splitTok,
      parseSplitPaymentData,
      this.setup.trustBase,
      this.setup.predicateVerifier,
    );
    assert.strictEqual(result.status, VerificationStatus.OK);
  }
});

Then('the split fails with TokenAssetCountMismatchError', function (this: TokenWorld): void {
  assert.ok(this.splitError instanceof TokenAssetCountMismatchError);
});

Then('the split fails with TokenAssetMissingError', function (this: TokenWorld): void {
  assert.ok(this.splitError instanceof TokenAssetMissingError);
});

Then('the split fails with TokenAssetValueMismatchError', function (this: TokenWorld): void {
  assert.ok(this.splitError instanceof TokenAssetValueMismatchError);
});
