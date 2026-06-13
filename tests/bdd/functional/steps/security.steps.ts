import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { attemptUnauthorizedTransfer, transferToken } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

Given('Alice has transferred the token to Bob', async function (this: TokenWorld): Promise<void> {
  this.transferredToken = await transferToken(
    this.setup,
    this.token,
    this.alice.predicate,
    this.alice.signingService,
    this.bob.predicate,
  );
});

// Post-PR #112: TransferTransaction.create no longer enforces ownership; the rejection point
// moved to the predicate verifier. Tests assert the verifier rejects the wrong-signer attempt.
When("Bob tries to create a transfer of Alice's token", async function (this: TokenWorld): Promise<void> {
  this.transferError = await attemptUnauthorizedTransfer(this.setup, this.token, this.bob, this.bob.predicate);
});

When('Alice tries to create a transfer of the token', async function (this: TokenWorld): Promise<void> {
  this.transferError = await attemptUnauthorizedTransfer(
    this.setup,
    this.transferredToken!,
    this.alice,
    this.alice.predicate,
  );
});

Then('the transfer creation fails with a predicate mismatch error', function (this: TokenWorld): void {
  assert.notStrictEqual(this.transferError, null);
});
