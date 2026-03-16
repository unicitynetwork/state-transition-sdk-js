import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { Token } from '../../../../src/transaction/Token.js';
import { TokenWorld } from '../support/World.js';

When('the CBOR data is truncated to half its length', function (this: TokenWorld): void {
  this.cborData = this.cborData.slice(0, Math.floor(this.cborData.length / 2));
});

When('random bytes are used as token CBOR data', function (this: TokenWorld): void {
  this.cborData = crypto.getRandomValues(new Uint8Array(64));
});

Then('importing the corrupted CBOR data fails with an error', async function (this: TokenWorld): Promise<void> {
  await assert.rejects(() => Token.fromCBOR(this.cborData));
});
