import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../../../src/predicate/builtin/SignaturePredicate.js';
import { CertifiedUnicityIdMintTransactionVerificationRule } from '../../../../src/transaction/verification/rule/CertifiedUnicityIdMintTransactionVerificationRule.js';
import { UnicityIdToken } from '../../../../src/unicity-id/UnicityIdToken.js';
import { VerificationResult } from '../../../../src/verification/VerificationResult.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { registerNametag } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

interface IIssuerPinStash {
  result?: VerificationResult<VerificationStatus>;
  token: UnicityIdToken;
  trueIssuerPublicKey: Uint8Array;
}

function getStash(world: TokenWorld): IIssuerPinStash {
  if (!world.issuerPinStash) {
    throw new Error('issuerPinStash not initialised — run the Background step first');
  }
  return world.issuerPinStash;
}

function randomPublicKey(): Uint8Array {
  return new SigningService(SigningService.generatePrivateKey()).publicKey;
}

Given('Alice has registered a nametag token', async function (this: TokenWorld): Promise<void> {
  const { createUser } = await import('../support/TestSetup.js');
  const alice = createUser();
  const token = await registerNametag(this.setup, alice, `issuer-pin-${Date.now()}`);
  const trueIssuerPublicKey = SignaturePredicate.fromPredicate(token.genesis.lockScript).publicKey;
  this.issuerPinStash = { token, trueIssuerPublicKey };
});

When(
  'the nametag token is verified against its genesis lock-script issuer',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    stash.result = await stash.token.verify(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      stash.trueIssuerPublicKey,
    );
  },
);

When(
  'the nametag token is verified against an unrelated issuer public key',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    stash.result = await stash.token.verify(this.setup.trustBase, this.setup.predicateVerifier, randomPublicKey());
  },
);

When('the genesis is verified by the rule with no issuer pin', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  stash.result = await CertifiedUnicityIdMintTransactionVerificationRule.verify(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    stash.token.genesis,
  );
});

When('the genesis is verified by the rule with the true issuer pin', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  stash.result = await CertifiedUnicityIdMintTransactionVerificationRule.verify(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    stash.token.genesis,
    stash.trueIssuerPublicKey,
  );
});

When(
  'the genesis is verified by the rule with an unrelated issuer pin',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    stash.result = await CertifiedUnicityIdMintTransactionVerificationRule.verify(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      stash.token.genesis,
      randomPublicKey(),
    );
  },
);

Then('the unicity-id verification result is OK', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.result, 'no result captured');
  assert.equal(stash.result.status, VerificationStatus.OK, `got ${stash.result.status}: ${stash.result.message}`);
});

Then('the unicity-id verification result is FAIL', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.result, 'no result captured');
  assert.equal(stash.result.status, VerificationStatus.FAIL, `got ${stash.result.status}: ${stash.result.message}`);
});

Then('the unicity-id failure message contains {string}', function (this: TokenWorld, fragment: string): void {
  const stash = getStash(this);
  const collected: string[] = [stash.result?.message ?? ''];
  const visit = (results: VerificationResult<unknown>[]): void => {
    for (const r of results) {
      collected.push(r.message ?? '');
      visit(r.results ?? []);
    }
  };
  visit(stash.result?.results ?? []);
  assert.ok(
    collected.some((m) => m.toLowerCase().includes(fragment.toLowerCase())),
    `expected "${fragment}" in any of: ${collected.join(' | ')}`,
  );
});
