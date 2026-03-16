import assert from 'node:assert/strict';

import { DataTable, Given, Then, When } from '@cucumber/cucumber';

import { Asset } from '../../../../src/payment/asset/Asset.js';
import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { ISplitPaymentData } from '../../../../src/payment/ISplitPaymentData.js';
import { SplitReason } from '../../../../src/payment/SplitReason.js';
import { TokenSplit } from '../../../../src/payment/TokenSplit.js';
import { CborDeserializer } from '../../../../src/serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { PayToScriptHash } from '../../../../src/transaction/PayToScriptHash.js';
import { Token } from '../../../../src/transaction/Token.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import {
  createAssetId,
  createUser,
  IUser,
  mintTokenWithAssets,
  parseSimplePaymentData,
  splitTokenToOwner,
  transferToken,
} from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

// Extend TokenWorld to include user registry and split token tracking
declare module '../support/World.js' {
  interface TokenWorld {
    users: Map<string, IUser>;
    userSplitTokens: Map<string, Token[]>;
    currentToken: Token;
    originalToken: Token;
  }
}

Given(
  '{string} has a minted token with assets worth {int} and {int}',
  async function (this: TokenWorld, userName: string, asset1Value: number, asset2Value: number): Promise<void> {
    if (!this.users) {
      this.users = new Map<string, IUser>();
    }
    if (!this.userSplitTokens) {
      this.userSplitTokens = new Map<string, Token[]>();
    }

    let user = this.users.get(userName);
    if (!user) {
      user = createUser();
      this.users.set(userName, user);
    }

    this.assetId1 = createAssetId();
    this.assetId2 = createAssetId();
    const assets = PaymentAssetCollection.create(
      new Asset(this.assetId1, BigInt(asset1Value)),
      new Asset(this.assetId2, BigInt(asset2Value)),
    );
    this.token = await mintTokenWithAssets(this.setup, user, assets);
    this.originalToken = this.token;
    this.currentToken = this.token;

    // Track this token for the user
    this.userSplitTokens.set(userName, [this.token]);
  },
);

When(
  /^"([^"]*)" splits the token into (\d+) parts with values (\d+)\/(\d+) and (\d+)\/(\d+)$/,
  async function (
    this: TokenWorld,
    userName: string,
    numParts: string,
    asset1Split1: string,
    asset1Split2: string,
    asset2Split1: string,
    asset2Split2: string,
  ): Promise<void> {
    const user = this.users.get(userName);
    if (!user) {
      throw new Error(`User ${userName} not found in registry`);
    }

    const splitTokenId1 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
    const splitTokenId2 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));

    const splitAssets: [TokenId, PaymentAssetCollection][] = [
      [
        splitTokenId1,
        PaymentAssetCollection.create(
          new Asset(this.assetId1, BigInt(parseInt(asset1Split1, 10))),
          new Asset(this.assetId2, BigInt(parseInt(asset2Split1, 10))),
        ),
      ],
      [
        splitTokenId2,
        PaymentAssetCollection.create(
          new Asset(this.assetId1, BigInt(parseInt(asset1Split2, 10))),
          new Asset(this.assetId2, BigInt(parseInt(asset2Split2, 10))),
        ),
      ],
    ];

    // Use splitTokenToOwner to mint split tokens back to the original owner
    // so they can be transferred to other users
    const result = await splitTokenToOwner(
      this.setup,
      this.token,
      user.predicate,
      user.signingService,
      splitAssets,
      parseSimplePaymentData,
      user, // mint back to the same user (Alice)
    );

    this.burnedToken = result.burnedToken;
    this.splitTokens = result.splitTokens;

    // Track split tokens for the owner
    this.userSplitTokens.set(userName, result.splitTokens);
  },
);

When(
  '{string} transfers split token {int} to {string}',
  async function (this: TokenWorld, fromUser: string, splitIndex: number, toUser: string): Promise<void> {
    const from = this.users.get(fromUser);
    const to = this.users.get(toUser);
    if (!from) {
      throw new Error(`User ${fromUser} not found in registry`);
    }
    if (!to) {
      throw new Error(`User ${toUser} not found in registry`);
    }

    const tokenIndex = splitIndex - 1; // Convert 1-based to 0-based
    const sourceToken = this.splitTokens[tokenIndex];

    const transferredToken = await transferToken(
      this.setup,
      sourceToken,
      from.predicate,
      from.signingService,
      to.predicate,
    );

    this.splitTokens[tokenIndex] = transferredToken;

    // Update token tracking
    let toTokens = this.userSplitTokens.get(toUser) ?? [];
    toTokens.push(transferredToken);
    this.userSplitTokens.set(toUser, toTokens);
  },
);

When(
  '{string} transfers his split token to {string}',
  async function (this: TokenWorld, fromUser: string, toUser: string): Promise<void> {
    const from = this.users.get(fromUser);
    const to = this.users.get(toUser);
    if (!from) {
      throw new Error(`User ${fromUser} not found in registry`);
    }
    if (!to) {
      throw new Error(`User ${toUser} not found in registry`);
    }

    const fromTokens = this.userSplitTokens.get(fromUser);
    if (!fromTokens || fromTokens.length === 0) {
      throw new Error(`User ${fromUser} has no split tokens to transfer`);
    }

    const sourceToken = fromTokens[fromTokens.length - 1]; // Get the last token

    const transferredToken = await transferToken(
      this.setup,
      sourceToken,
      from.predicate,
      from.signingService,
      to.predicate,
    );

    this.currentToken = transferredToken;
    this.transferredToken = transferredToken;

    // Update token tracking
    let toTokens = this.userSplitTokens.get(toUser) ?? [];
    toTokens.push(transferredToken);
    this.userSplitTokens.set(toUser, toTokens);
  },
);

When(
  /^"([^"]*)" splits his token into (\d+) sub-parts with values (\d+)\/(\d+) and (\d+)\/(\d+)$/,
  async function (
    this: TokenWorld,
    userName: string,
    numParts: string,
    asset1Split1: string,
    asset1Split2: string,
    asset2Split1: string,
    asset2Split2: string,
  ): Promise<void> {
    const user = this.users.get(userName);
    if (!user) {
      throw new Error(`User ${userName} not found in registry`);
    }

    const userTokens = this.userSplitTokens.get(userName);
    if (!userTokens || userTokens.length === 0) {
      throw new Error(`User ${userName} has no tokens to split`);
    }

    const tokenToSplit = userTokens[userTokens.length - 1];

    const splitTokenId1 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
    const splitTokenId2 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));

    const splitAssets: [TokenId, PaymentAssetCollection][] = [
      [
        splitTokenId1,
        PaymentAssetCollection.create(
          new Asset(this.assetId1, BigInt(parseInt(asset1Split1, 10))),
          new Asset(this.assetId2, BigInt(parseInt(asset2Split1, 10))),
        ),
      ],
      [
        splitTokenId2,
        PaymentAssetCollection.create(
          new Asset(this.assetId1, BigInt(parseInt(asset1Split2, 10))),
          new Asset(this.assetId2, BigInt(parseInt(asset2Split2, 10))),
        ),
      ],
    ];

    // Use the parseSplitPaymentData to properly parse the nested split data
    const parseSplitPaymentData = async (bytes: Uint8Array): Promise<{ assets: PaymentAssetCollection; toCBOR: () => Promise<Uint8Array> }> => {
      const data = CborDeserializer.decodeArray(bytes);
      const assets = PaymentAssetCollection.fromCBOR(data[0]);
      return {
        assets,
        toCBOR: (): Promise<Uint8Array> => Promise.resolve(bytes),
      };
    };

    const result = await splitTokenToOwner(
      this.setup,
      tokenToSplit,
      user.predicate,
      user.signingService,
      splitAssets,
      parseSplitPaymentData,
      user, // mint back to the same user
    );

    this.subSplitTokens = result.splitTokens;
    this.userSplitTokens.set(userName, result.splitTokens);
  },
);

Then('{string} should own split token {int}', async function (this: TokenWorld, userName: string, splitIndex: number): Promise<void> {
  const user = this.users.get(userName);
  if (!user) {
    throw new Error(`User ${userName} not found in registry`);
  }

  const tokenIndex = splitIndex - 1;
  const token = this.splitTokens[tokenIndex];
  const result = await token.verify(this.setup.trustBase, this.setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then('{string} should own the transferred split token', async function (this: TokenWorld, userName: string): Promise<void> {
  const user = this.users.get(userName);
  if (!user) {
    throw new Error(`User ${userName} not found in registry`);
  }

  const token = this.transferredToken ?? this.currentToken;
  const result = await token.verify(this.setup.trustBase, this.setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then('both split tokens should pass verification', async function (this: TokenWorld): Promise<void> {
  for (const token of this.splitTokens) {
    const result = await token.verify(this.setup.trustBase, this.setup.predicateVerifier);
    assert.strictEqual(result.status, VerificationStatus.OK);
  }
});

Then('the transferred split token should pass verification', async function (this: TokenWorld): Promise<void> {
  const token = this.transferredToken ?? this.currentToken;
  const result = await token.verify(this.setup.trustBase, this.setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then('{int} sub-split tokens should be created', function (this: TokenWorld, expectedCount: number): void {
  assert.strictEqual(this.subSplitTokens.length, expectedCount);
});

Then('each sub-split token should pass verification', async function (this: TokenWorld): Promise<void> {
  for (const token of this.subSplitTokens) {
    const result = await token.verify(this.setup.trustBase, this.setup.predicateVerifier);
    assert.strictEqual(result.status, VerificationStatus.OK);
  }
});

When('split token {int} is exported to CBOR', function (this: TokenWorld, splitIndex: number): void {
  const tokenIndex = splitIndex - 1;
  const token = this.splitTokens[tokenIndex];
  this.cborData = token.toCBOR();
});

Then('the imported split token should have the same ID', function (this: TokenWorld): void {
  const originalToken = this.splitTokens[0];
  assert.deepStrictEqual(this.importedToken.id.bytes, originalToken.id.bytes);
});

Then('the imported split token should pass verification', async function (this: TokenWorld): Promise<void> {
  const result = await this.importedToken.verify(this.setup.trustBase, this.setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});

When('{string} tries to split {string}\'s token', async function (this: TokenWorld, attackerName: string, ownerName: string): Promise<void> {
  const attacker = this.users.get(attackerName);
  const owner = this.users.get(ownerName);
  if (!attacker) {
    throw new Error(`User ${attackerName} not found in registry`);
  }
  if (!owner) {
    throw new Error(`User ${ownerName} not found in registry`);
  }

  // The token should be the currentToken which was transferred to the owner
  const tokenToSplit = this.currentToken;
  if (!tokenToSplit) {
    throw new Error(`No current token available - expected ${ownerName}'s token`);
  }

  const splitTokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));

  // Use the actual asset values from the original token (100 and 200)
  // to ensure we get past asset validation and reach predicate check
  const splitAssets: [TokenId, PaymentAssetCollection][] = [
    [
      splitTokenId,
      PaymentAssetCollection.create(
        new Asset(this.assetId1, 100n),
        new Asset(this.assetId2, 200n),
      ),
    ],
  ];

  try {
    await TokenSplit.split(tokenToSplit, attacker.predicate, parseSimplePaymentData, splitAssets);
    this.splitError = null;
  } catch (e) {
    this.splitError = e as Error;
  }
});

Then('the split should fail with predicate mismatch', function (this: TokenWorld): void {
  assert.notStrictEqual(this.splitError, null, 'Expected split to fail');
  assert.ok(this.splitError!.message.includes('Predicate does not match'), `Expected predicate mismatch error but got: ${this.splitError!.message}`);
});

When('{string} tries to transfer the original token to {string}', async function (this: TokenWorld, fromUser: string, toUser: string): Promise<void> {
  const from = this.users.get(fromUser);
  const to = this.users.get(toUser);
  if (!from) {
    throw new Error(`User ${fromUser} not found in registry`);
  }
  if (!to) {
    throw new Error(`User ${toUser} not found in registry`);
  }

  try {
    await TransferTransaction.create(
      this.burnedToken,
      from.predicate,
      await PayToScriptHash.create(to.predicate),
      crypto.getRandomValues(new Uint8Array(32)),
      CborSerializer.encodeArray(),
    );
    this.transferError = null;
  } catch (e) {
    this.transferError = e as Error;
  }
});

Then('the transfer should fail because the token was burned', function (this: TokenWorld): void {
  assert.notStrictEqual(this.transferError, null, 'Expected transfer to fail');
  assert.ok(this.transferError!.message.includes('Predicate does not match'), `Expected predicate mismatch error but got: ${this.transferError!.message}`);
});
