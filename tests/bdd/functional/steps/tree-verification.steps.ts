import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { TokenSplit } from '../../../../src/payment/TokenSplit.js';
import { Token } from '../../../../src/transaction/Token.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { parseSplitVerificationData } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

Then(/^"(.+)" passes verification$/, async function (this: TokenWorld, tokenName: string): Promise<void> {
  const token = this.tree.tokensByName.get(tokenName)!;
  assert.ok(token !== undefined);
  const result = await token.verify(this.tree.setup.trustBase, this.tree.setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});

Then(/^"(.+)" passes split verification$/, async function (this: TokenWorld, tokenName: string): Promise<void> {
  const token = this.tree.tokensByName.get(tokenName)!;
  assert.ok(token !== undefined);
  const result = await TokenSplit.verify(
    token,
    parseSplitVerificationData,
    this.tree.setup.trustBase,
    this.tree.setup.predicateVerifier,
  );
  assert.strictEqual(result.status, VerificationStatus.OK);
});

When(
  /^"(.+)" is exported to CBOR and imported back$/,
  async function (this: TokenWorld, tokenName: string): Promise<void> {
    const token = this.tree.tokensByName.get(tokenName)!;
    assert.ok(token !== undefined);
    this.importedToken = await Token.fromCBOR(token.toCBOR());
  },
);

Then(/^the imported token has the same ID as "(.+)"$/, function (this: TokenWorld, tokenName: string): void {
  const token = this.tree.tokensByName.get(tokenName)!;
  assert.deepStrictEqual(this.importedToken.id.bytes, token.id.bytes);
});
