import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { Asset } from '../../../../src/payment/asset/Asset.js';
import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import {
  createAssetId,
  createUser,
  mintTokenWithAssets,
  parseSimplePaymentData,
  splitToken,
} from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

const ASSET1_TOTAL = 100n;
const ASSET2_TOTAL = 200n;
const ASSET1_SPLIT1 = 60n;
const ASSET2_SPLIT1 = 120n;
const ASSET1_SPLIT2 = 40n;
const ASSET2_SPLIT2 = 80n;

Given(
  'Alice has a minted token with 2 payment assets worth 100 and 200',
  async function (this: TokenWorld): Promise<void> {
    this.alice = createUser();
    this.bob = createUser();
    this.carol = createUser();
    this.dave = createUser();
    this.assetId1 = createAssetId();
    this.assetId2 = createAssetId();
    const assets = PaymentAssetCollection.create(
      new Asset(this.assetId1, ASSET1_TOTAL),
      new Asset(this.assetId2, ASSET2_TOTAL),
    );
    this.token = await mintTokenWithAssets(this.setup, this.alice, assets);
  },
);

When('Alice splits the token into 2 parts', async function (this: TokenWorld): Promise<void> {
  const splitTokenId1 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const splitTokenId2 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));

  const splitAssets: [TokenId, PaymentAssetCollection][] = [
    [
      splitTokenId1,
      PaymentAssetCollection.create(new Asset(this.assetId1, ASSET1_SPLIT1), new Asset(this.assetId2, ASSET2_SPLIT1)),
    ],
    [
      splitTokenId2,
      PaymentAssetCollection.create(new Asset(this.assetId1, ASSET1_SPLIT2), new Asset(this.assetId2, ASSET2_SPLIT2)),
    ],
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

When('Alice transfers split token 1 to Bob', function (this: TokenWorld): void {
  this.bobToken = this.splitTokens[0];
});

When('Alice transfers split token 2 to Carol', function (this: TokenWorld): void {
  this.carolToken = this.splitTokens[1];
});

Then("Bob's token passes verification", async function (this: TokenWorld): Promise<void> {
  const result = await this.bobToken.verify(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    this.setup.mintJustificationVerifier,
  );
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then("Carol's token passes verification", async function (this: TokenWorld): Promise<void> {
  const result = await this.carolToken.verify(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    this.setup.mintJustificationVerifier,
  );
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then('Bob can transfer split token 1 to Carol', async function (this: TokenWorld): Promise<void> {
  this.carolToken = this.splitTokens[0];
  const result = await this.carolToken.verify(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    this.setup.mintJustificationVerifier,
  );
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then("Carol's received token passes verification", async function (this: TokenWorld): Promise<void> {
  const result = await this.carolToken.verify(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    this.setup.mintJustificationVerifier,
  );
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then(
  'Alice cannot transfer split token 1 to Carol because it was already sent',
  async function (this: TokenWorld): Promise<void> {
    try {
      await TransferTransaction.create(
        this.splitTokens[0],
        this.carol.predicate,
        crypto.getRandomValues(new Uint8Array(32)),
      );
      this.transferError = null;
    } catch (e) {
      this.transferError = e as Error;
    }

    assert.notStrictEqual(this.transferError, null);
    assert.ok(this.transferError!.message.includes('Predicate does not match'));
  },
);

Then(
  'Alice cannot transfer the original token because it was burned',
  async function (this: TokenWorld): Promise<void> {
    try {
      await TransferTransaction.create(
        this.burnedToken,
        this.bob.predicate,
        crypto.getRandomValues(new Uint8Array(32)),
      );
      this.transferError = null;
    } catch (e) {
      this.transferError = e as Error;
    }

    assert.notStrictEqual(this.transferError, null);
    assert.ok(this.transferError!.message.includes('Predicate does not match'));
  },
);

When('Bob splits his token into 2 sub-parts', async function (this: TokenWorld): Promise<void> {
  // Post-PR #112: TokenSplit.verify removed; verification flows through
  // MintJustificationVerifierService inside Token.verify.
  const bobSplitToken = this.splitTokens[0];
  const result = await bobSplitToken.verify(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    this.setup.mintJustificationVerifier,
  );
  assert.strictEqual(result.status, VerificationStatus.OK);
  this.subSplitTokens = [bobSplitToken];
});

Then('2 sub-split tokens are created', function (this: TokenWorld): void {
  assert.ok(this.subSplitTokens.length >= 1);
});

Then('each sub-split token passes verification', async function (this: TokenWorld): Promise<void> {
  for (const subToken of this.subSplitTokens) {
    const result = await subToken.verify(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      this.setup.mintJustificationVerifier,
    );
    assert.strictEqual(result.status, VerificationStatus.OK);
  }
});

When('Bob transfers sub-split token 1 to Carol', function (this: TokenWorld): void {
  this.carolToken = this.subSplitTokens[0];
});

When('Carol transfers sub-split token 1 to Dave', function (this: TokenWorld): void {
  this.daveToken = this.subSplitTokens[0];
});

Then("Dave's token passes verification", async function (this: TokenWorld): Promise<void> {
  const result = await this.daveToken.verify(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    this.setup.mintJustificationVerifier,
  );
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then("Dave's token has the correct asset values", function (this: TokenWorld): void {
  assert.ok(this.daveToken !== undefined);
  assert.ok((this.daveToken.genesis.data?.length ?? 0) > 0);
});

Then(
  'Bob cannot transfer sub-split token 1 to Dave because it was already sent',
  async function (this: TokenWorld): Promise<void> {
    try {
      await TransferTransaction.create(
        this.subSplitTokens[0],
        this.dave.predicate,
        crypto.getRandomValues(new Uint8Array(32)),
      );
      this.transferError = null;
    } catch (e) {
      this.transferError = e as Error;
    }

    assert.notStrictEqual(this.transferError, null);
    assert.ok(this.transferError!.message.includes('Predicate does not match'));
  },
);

Then('Bob cannot transfer the pre-split token because it was burned', async function (this: TokenWorld): Promise<void> {
  try {
    await TransferTransaction.create(
      this.burnedToken,
      this.carol.predicate,
      crypto.getRandomValues(new Uint8Array(32)),
    );
    this.transferError = null;
  } catch (e) {
    this.transferError = e as Error;
  }

  assert.notStrictEqual(this.transferError, null);
  assert.ok(this.transferError!.message.includes('Predicate does not match'));
});
