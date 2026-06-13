import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Then, When } from '@cucumber/cucumber';

import { RootTrustBase } from '../../../../src/api/bft/RootTrustBase.js';
import { VerificationResult } from '../../../../src/verification/VerificationResult.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { TokenWorld } from '../support/World.js';

/**
 * Construct a synthetic trust base by reading the trust-base JSON used by this run and
 * overriding its `networkId`. Everything else (root nodes, sig keys, quorum, signatures)
 * stays as-is; the network rule will fire FIRST in verification, so the negative scenarios
 * observe a `*NetworkMatchesTrustBaseRule` FAIL regardless of whether signatures would also
 * mismatch later (they won't even be checked).
 */
function buildWrongNetworkTrustBase(alternateNetworkId: number): RootTrustBase {
  const trustBasePath =
    process.env.TRUST_BASE_PATH ??
    fileURLToPath(new URL('../../../../tests/functional/trust-base.json', import.meta.url));
  const realJson = JSON.parse(readFileSync(trustBasePath, 'utf-8')) as { networkId: number };
  return RootTrustBase.fromJSON({ ...realJson, networkId: alternateNetworkId });
}

function findRule(result: VerificationResult<unknown>, ruleName: string): VerificationResult<unknown> | null {
  if (result.rule === ruleName) {
    return result;
  }
  for (const child of result.results ?? []) {
    const hit = findRule(child, ruleName);
    if (hit) {
      return hit;
    }
  }
  return null;
}

function getStash(world: TokenWorld): NonNullable<TokenWorld['networkConsistencyStash']> {
  world.networkConsistencyStash ??= {};
  return world.networkConsistencyStash;
}

When('the token is verified under its native trust base', async function (this: TokenWorld): Promise<void> {
  getStash(this).result = await this.token.verify(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    this.setup.mintJustificationVerifier,
  );
});

When(
  'the token is verified under a trust base whose networkId is changed to {int}',
  async function (this: TokenWorld, alternateNetworkId: number): Promise<void> {
    const wrongTrustBase = buildWrongNetworkTrustBase(alternateNetworkId);
    getStash(this).result = await this.token.verify(
      wrongTrustBase,
      this.setup.predicateVerifier,
      this.setup.mintJustificationVerifier,
    );
  },
);

When(
  'the transferred token is verified under a trust base whose networkId is changed to {int}',
  async function (this: TokenWorld, alternateNetworkId: number): Promise<void> {
    assert.ok(this.transferredToken, 'no transferred token in world — the prior transfer step did not run');
    const wrongTrustBase = buildWrongNetworkTrustBase(alternateNetworkId);
    getStash(this).result = await this.transferredToken.verify(
      wrongTrustBase,
      this.setup.predicateVerifier,
      this.setup.mintJustificationVerifier,
    );
  },
);

Then('the network-consistency verification status is {word}', function (this: TokenWorld, expected: string): void {
  const stash = getStash(this);
  assert.ok(stash.result, 'verification was never invoked');
  const expectedStatus = expected === 'OK' ? VerificationStatus.OK : VerificationStatus.FAIL;
  assert.strictEqual(
    stash.result.status,
    expectedStatus,
    `expected verification ${expected}, got ${String(stash.result.status)}: ${stash.result.message ?? ''}`,
  );
});

Then(
  'the verification result contains a {string} rule with status {string}',
  function (this: TokenWorld, ruleName: string, status: string): void {
    const stash = getStash(this);
    assert.ok(stash.result, 'verification was never invoked');
    const hit = findRule(stash.result, ruleName);
    assert.ok(hit, `rule "${ruleName}" not present in verification result tree`);
    const expected = status === 'OK' ? VerificationStatus.OK : VerificationStatus.FAIL;
    assert.strictEqual(hit.status, expected, `rule "${ruleName}" status was ${String(hit.status)}, expected ${status}`);
  },
);
