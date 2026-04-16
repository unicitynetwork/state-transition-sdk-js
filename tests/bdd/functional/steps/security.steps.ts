import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { Address } from '../../../../src/transaction/Address.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { transferToken } from '../support/TestSetup.js';
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

When("Bob tries to create a transfer of Alice's token", async function (this: TokenWorld): Promise<void> {
  try {
    await TransferTransaction.create(
      this.token,
      this.bob.predicate,
      await Address.fromPredicate(this.bob.predicate),
      crypto.getRandomValues(new Uint8Array(32)),
      CborSerializer.encodeArray(),
    );
  } catch (e) {
    this.transferError = e as Error;
  }
});

When('Alice tries to create a transfer of the token', async function (this: TokenWorld): Promise<void> {
  try {
    await TransferTransaction.create(
      this.transferredToken!,
      this.alice.predicate,
      await Address.fromPredicate(this.alice.predicate),
      crypto.getRandomValues(new Uint8Array(32)),
      CborSerializer.encodeArray(),
    );
  } catch (e) {
    this.transferError = e as Error;
  }
});

Then('the transfer creation fails with a predicate mismatch error', function (this: TokenWorld): void {
  assert.notStrictEqual(this.transferError, null);
  assert.ok(this.transferError!.message.includes('Predicate does not match'));
});
