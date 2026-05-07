import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { TokenWorld } from '../support/World.js';

interface ITransferFieldsStash {
  built: TransferTransaction;
  decoded?: TransferTransaction;
}

function getStash(world: TokenWorld): ITransferFieldsStash {
  if (!world.transferFieldsStash) {
    throw new Error('transferFieldsStash not initialised');
  }
  return world.transferFieldsStash;
}

Given(
  /^a TransferTransaction is built from Alice's token with a stateMask of (\d+) bytes$/,
  async function (this: TokenWorld, lengthRaw: string): Promise<void> {
    const length = parseInt(lengthRaw, 10);
    const stateMask = new Uint8Array(length);
    crypto.getRandomValues(stateMask);
    const built = await TransferTransaction.create(this.token, this.alice.predicate, stateMask);
    this.transferFieldsStash = { built };
  },
);

When('the TransferTransaction is encoded and decoded', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  stash.decoded = await TransferTransaction.fromCBOR(stash.built.toCBOR(), this.token);
});

Then(/^the decoded stateMask is (\d+) bytes$/, function (this: TokenWorld, lengthRaw: string): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'decoded missing');
  assert.equal(stash.decoded.stateMask.length, parseInt(lengthRaw, 10));
});

Then('the decoded stateMask byte-for-byte equals the original', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'decoded missing');
  assert.equal(HexConverter.encode(stash.decoded.stateMask), HexConverter.encode(stash.built.stateMask));
});
