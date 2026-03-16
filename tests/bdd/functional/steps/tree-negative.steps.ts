import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { TokenSplit } from '../../../../src/payment/TokenSplit.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { PayToScriptHash } from '../../../../src/transaction/PayToScriptHash.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { createUser } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

When(
  /^(\w+) tries to transfer "(.+)"$/,
  async function (this: TokenWorld, userName: string, tokenName: string): Promise<void> {
    const user = this.tree.usersByName.get(userName)!;
    const token = this.tree.tokensByName.get(tokenName)!;
    assert.ok(user !== undefined);
    assert.ok(token !== undefined);
    const recipient = createUser();
    this.transferError = null;

    try {
      await TransferTransaction.create(
        token,
        user.predicate,
        await PayToScriptHash.create(recipient.predicate),
        crypto.getRandomValues(new Uint8Array(32)),
        CborSerializer.encodeArray(),
      );
    } catch (e) {
      this.transferError = e as Error;
    }
  },
);

Then('the transfer fails with predicate mismatch', function (this: TokenWorld): void {
  assert.notStrictEqual(this.transferError, null);
  assert.ok(this.transferError!.message.includes('Predicate does not match'));
});

When(
  /^(\w+) tries to split "(.+)"$/,
  async function (this: TokenWorld, userName: string, tokenName: string): Promise<void> {
    const user = this.tree.usersByName.get(userName)!;
    const token = this.tree.tokensByName.get(tokenName)!;
    const assets = this.tree.tokenAssets.get(tokenName)!;
    const parser = this.tree.tokenParsers.get(tokenName)!;
    assert.ok(user !== undefined);
    assert.ok(token !== undefined);
    assert.ok(assets !== undefined);
    assert.ok(parser !== undefined);
    this.splitError = null;

    const splitTokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
    const splitAssets: [TokenId, PaymentAssetCollection][] = [[splitTokenId, assets]];

    try {
      await TokenSplit.split(token, user.predicate, parser, splitAssets);
    } catch (e) {
      this.splitError = e as Error;
    }
  },
);

Then('the split fails with predicate mismatch', function (this: TokenWorld): void {
  assert.notStrictEqual(this.splitError, null);
  assert.ok(this.splitError!.message.includes('Predicate does not match'));
});
