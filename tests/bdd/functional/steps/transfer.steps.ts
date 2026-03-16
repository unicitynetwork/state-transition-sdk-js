import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { transferToken } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

When('Alice transfers the token to Bob', async function (this: TokenWorld): Promise<void> {
  this.transferredToken = await transferToken(
    this.setup,
    this.token,
    this.alice.predicate,
    this.alice.signingService,
    this.bob.predicate,
  );
});

When('Bob transfers the token back to Alice', async function (this: TokenWorld): Promise<void> {
  this.finalToken = await transferToken(
    this.setup,
    this.transferredToken!,
    this.bob.predicate,
    this.bob.signingService,
    this.alice.predicate,
  );
});

Then('the transfer certification succeeds', function (this: TokenWorld): void {
  assert.ok(this.transferredToken !== undefined);
});

Then('the token is finalized', function (this: TokenWorld): void {
  assert.ok(this.transferredToken!.transactions.length > 0);
});

Then('the transferred token passes verification', async function (this: TokenWorld): Promise<void> {
  const setup = this.tree?.setup ?? this.setup;
  assert.ok(this.transferredToken !== null);
  const result = await this.transferredToken.verify(setup.trustBase, setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then('the final token passes verification', async function (this: TokenWorld): Promise<void> {
  const result = await this.finalToken.verify(this.setup.trustBase, this.setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});
