import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { TokenWorld } from '../support/World.js';

When('the token is verified against the trust base', async function (this: TokenWorld): Promise<void> {
  this.verificationResult = await this.token.verify(this.setup.trustBase, this.setup.predicateVerifier);
});

When('the transferred token is verified against the trust base', async function (this: TokenWorld): Promise<void> {
  assert.ok(this.transferredToken !== null);
  this.verificationResult = await this.transferredToken.verify(this.setup.trustBase, this.setup.predicateVerifier);
});

Then(
  /^the verification result has rule "([^"]+)" with status "([^"]+)"$/,
  function (this: TokenWorld, rule: string, status: string): void {
    assert.strictEqual(this.verificationResult.rule, rule);
    const expected = VerificationStatus[status as keyof typeof VerificationStatus];
    assert.ok(expected !== undefined, `Unknown VerificationStatus: ${status}`);
    assert.strictEqual(this.verificationResult.status, expected);
  },
);

Then(/^the verification result contains (\d+) sub-results$/, function (this: TokenWorld, countStr: string): void {
  assert.strictEqual(this.verificationResult.results.length, parseInt(countStr, 10));
});

Then(
  /^sub-result (\d+) has rule "([^"]+)" with status "([^"]+)"$/,
  function (this: TokenWorld, indexStr: string, rule: string, status: string): void {
    const index = parseInt(indexStr, 10) - 1;
    const subResult = this.verificationResult.results[index];
    assert.ok(subResult !== undefined, `Sub-result at index ${index} not found`);
    assert.strictEqual(subResult.rule, rule);
    const expected = VerificationStatus[status as keyof typeof VerificationStatus];
    assert.ok(expected !== undefined, `Unknown VerificationStatus: ${status}`);
    assert.strictEqual(subResult.status, expected);
  },
);

Then(
  /^the transfer verification sub-result contains (\d+) entr(?:y|ies)$/,
  function (this: TokenWorld, countStr: string): void {
    const count = parseInt(countStr, 10);
    const transferResult = this.verificationResult.results.find((r) => r.rule === 'TokenTransferVerification');
    assert.ok(transferResult !== undefined, 'TokenTransferVerification sub-result not found');
    assert.strictEqual(transferResult.results.length, count);
  },
);
