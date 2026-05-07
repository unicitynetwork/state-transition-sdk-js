import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { attemptUnauthorizedSplit, attemptUnauthorizedTransfer, createUser } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

// Post-PR #112: ownership is no longer enforced at TransferTransaction.create or TokenSplit.split;
// it's checked by the predicate verifier when the burn/transfer signature is checked.
When(
  /^(\w+) tries to transfer "(.+)"$/,
  async function (this: TokenWorld, userName: string, tokenName: string): Promise<void> {
    const attacker = this.tree.usersByName.get(userName)!;
    const token = this.tree.tokensByName.get(tokenName)!;
    assert.ok(attacker !== undefined);
    assert.ok(token !== undefined);
    const recipient = createUser();
    this.transferError = await attemptUnauthorizedTransfer(this.tree.setup, token, attacker, recipient.predicate);
  },
);

Then('the transfer fails with predicate mismatch', function (this: TokenWorld): void {
  assert.notStrictEqual(this.transferError, null);
});

When(
  /^(\w+) tries to split "(.+)"$/,
  async function (this: TokenWorld, userName: string, tokenName: string): Promise<void> {
    const attacker = this.tree.usersByName.get(userName)!;
    const token = this.tree.tokensByName.get(tokenName)!;
    const assets = this.tree.tokenAssets.get(tokenName)!;
    const parser = this.tree.tokenParsers.get(tokenName)!;
    assert.ok(attacker !== undefined);
    assert.ok(token !== undefined);
    assert.ok(assets !== undefined);
    assert.ok(parser !== undefined);

    const splitTokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
    const splitAssets: [TokenId, PaymentAssetCollection][] = [[splitTokenId, assets]];
    this.splitError = await attemptUnauthorizedSplit(this.tree.setup, token, attacker, parser, splitAssets);
  },
);

Then('the split fails with predicate mismatch', function (this: TokenWorld): void {
  assert.notStrictEqual(this.splitError, null);
});
