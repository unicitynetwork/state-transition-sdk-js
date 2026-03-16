import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { Token } from '../../../../src/transaction/Token.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { TokenWorld } from '../support/World.js';

When('the token is exported to CBOR', function (this: TokenWorld): void {
  this.cborData = this.token.toCBOR();
});

When('the CBOR data is imported back to a token', async function (this: TokenWorld): Promise<void> {
  this.importedToken = await Token.fromCBOR(this.cborData);
});

Then('the imported token has the same ID as the original', function (this: TokenWorld): void {
  assert.deepStrictEqual(this.importedToken.id.bytes, this.token.id.bytes);
});

Then('the imported token has the same type as the original', function (this: TokenWorld): void {
  assert.deepStrictEqual(this.importedToken.type.bytes, this.token.type.bytes);
});

Then('the imported token passes verification', async function (this: TokenWorld): Promise<void> {
  const setup = this.tree?.setup ?? this.setup;
  const result = await this.importedToken.verify(setup.trustBase, setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});
