import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { Token } from '../../../../src/transaction/Token.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { TokenWorld } from '../support/World.js';

When('the current token is exported to CBOR', function (this: TokenWorld): void {
  const token = this.currentToken ?? this.token;
  this.cborData = token.toCBOR();
});

Then('the imported token should have the same ID as the current token', function (this: TokenWorld): void {
  const currentToken = this.currentToken ?? this.token;
  assert.deepStrictEqual(this.importedToken.id.bytes, currentToken.id.bytes);
});

Then(
  /^the imported token should have (\d+) transactions? in its history$/,
  function (this: TokenWorld, expectedCount: string): void {
    assert.strictEqual(this.importedToken.transactions.length, parseInt(expectedCount, 10));
  },
);

Then('the imported token should pass verification', async function (this: TokenWorld): Promise<void> {
  const result = await this.importedToken.verify(this.setup.trustBase, this.setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});
