import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { Asset } from '../../../../src/payment/asset/Asset.js';
import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { parseSimplePaymentData, splitTokenToOwner, transferToken } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

When('Alice splits the token into 2 parts keeping ownership', async function (this: TokenWorld): Promise<void> {
  const splitAssets: [TokenId, PaymentAssetCollection][] = [
    [
      new TokenId(crypto.getRandomValues(new Uint8Array(32))),
      PaymentAssetCollection.create(new Asset(this.assetId1, 60n), new Asset(this.assetId2, 120n)),
    ],
    [
      new TokenId(crypto.getRandomValues(new Uint8Array(32))),
      PaymentAssetCollection.create(new Asset(this.assetId1, 40n), new Asset(this.assetId2, 80n)),
    ],
  ];

  const result = await splitTokenToOwner(
    this.setup,
    this.token,
    this.alice.predicate,
    this.alice.signingService,
    splitAssets,
    parseSimplePaymentData,
    this.alice,
  );

  this.burnedToken = result.burnedToken;
  this.splitTokens = result.splitTokens;
});

When('Alice transfers the first split token to Bob', async function (this: TokenWorld): Promise<void> {
  this.bobToken = await transferToken(
    this.setup,
    this.splitTokens[0],
    this.alice.predicate,
    this.alice.signingService,
    this.bob.predicate,
  );
});

Then("Bob's received token passes verification", async function (this: TokenWorld): Promise<void> {
  const result = await this.bobToken.verify(this.setup.trustBase, this.setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});
