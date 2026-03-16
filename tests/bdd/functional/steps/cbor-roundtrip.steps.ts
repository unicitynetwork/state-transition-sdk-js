import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { TokenWorld } from '../support/World.js';

When('the transferred token is exported to CBOR', function (this: TokenWorld): void {
  assert.ok(this.transferredToken !== null);
  this.cborData = this.transferredToken.toCBOR();
});

When('the first split token is exported to CBOR', function (this: TokenWorld): void {
  this.cborData = this.splitTokens[0].toCBOR();
});

Then(
  /^the imported token has (\d+) transactions? in its history$/,
  function (this: TokenWorld, expectedCount: string): void {
    assert.strictEqual(this.importedToken.transactions.length, parseInt(expectedCount, 10));
  },
);
