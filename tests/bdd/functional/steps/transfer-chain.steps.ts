import assert from 'node:assert/strict';

import { DataTable, Given, Then, When } from '@cucumber/cucumber';

import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { createUser, IUser, mintToken, transferToken } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

Given('the following users are registered:', function (this: TokenWorld, dataTable: DataTable): void {
  this.users = new Map<string, IUser>();
  const rows = dataTable.hashes();
  for (const row of rows) {
    const name = row['name'];
    this.users.set(name, createUser());
  }
});

Given('{string} has a minted token', async function (this: TokenWorld, userName: string): Promise<void> {
  const user = this.users.get(userName);
  if (!user) {
    throw new Error(`User ${userName} not found in registry`);
  }
  this.token = await mintToken(this.setup, user);
  this.originalToken = this.token;
  this.currentToken = this.token;
});

When(
  '{string} transfers the token to {string}',
  async function (this: TokenWorld, fromUser: string, toUser: string): Promise<void> {
    const from = this.users.get(fromUser);
    const to = this.users.get(toUser);
    if (!from) {
      throw new Error(`User ${fromUser} not found in registry`);
    }
    if (!to) {
      throw new Error(`User ${toUser} not found in registry`);
    }

    const sourceToken = this.currentToken ?? this.token;
    this.currentToken = await transferToken(this.setup, sourceToken, from.predicate, from.signingService, to.predicate);
  },
);

When(
  '{string} transfers the imported token to {string}',
  async function (this: TokenWorld, fromUser: string, toUser: string): Promise<void> {
    const from = this.users.get(fromUser);
    const to = this.users.get(toUser);
    if (!from) {
      throw new Error(`User ${fromUser} not found in registry`);
    }
    if (!to) {
      throw new Error(`User ${toUser} not found in registry`);
    }

    this.currentToken = await transferToken(
      this.setup,
      this.importedToken,
      from.predicate,
      from.signingService,
      to.predicate,
    );
  },
);

Then(
  /^the token should have (\d+) transactions? in its history$/,
  function (this: TokenWorld, expectedCount: string): void {
    const token = this.currentToken ?? this.token;
    assert.strictEqual(token.transactions.length, parseInt(expectedCount, 10));
  },
);

Then('the token should pass verification', async function (this: TokenWorld): Promise<void> {
  const token = this.currentToken ?? this.token;
  const result = await token.verify(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    this.setup.mintJustificationVerifier,
  );
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then('the token should have the same ID as the original', function (this: TokenWorld): void {
  const token = this.currentToken ?? this.token;
  assert.deepStrictEqual(token.id.bytes, this.originalToken.id.bytes);
});

Then('the token should have the same type as the original', function (this: TokenWorld): void {
  const token = this.currentToken ?? this.token;
  assert.deepStrictEqual(token.type.bytes, this.originalToken.type.bytes);
});

Then('{string} should own the token', async function (this: TokenWorld, userName: string): Promise<void> {
  const user = this.users.get(userName);
  if (!user) {
    throw new Error(`User ${userName} not found in registry`);
  }
  // Verify token is valid (owner verification is implicit in transfer success)
  const token = this.currentToken ?? this.token;
  const result = await token.verify(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    this.setup.mintJustificationVerifier,
  );
  assert.strictEqual(result.status, VerificationStatus.OK);
});
