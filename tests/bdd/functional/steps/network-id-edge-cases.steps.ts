import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { RootTrustBase } from '../../../../src/api/bft/RootTrustBase.js';
import { NetworkId } from '../../../../src/api/NetworkId.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { TokenWorld } from '../support/World.js';

interface INetworkIdEdgeStash {
  baseline?: NetworkId;
  first?: NetworkId;
  roundTripped?: NetworkId;
  second?: NetworkId;
}

const CONSTANT_BY_NAME: Record<string, NetworkId> = {
  LOCAL: NetworkId.LOCAL,
  MAINNET: NetworkId.MAINNET,
  TESTNET: NetworkId.TESTNET,
};

function getStash(world: TokenWorld): INetworkIdEdgeStash {
  world.networkIdEdgeStash ??= {};
  return world.networkIdEdgeStash;
}

When('NetworkId.fromId is called with {int} a second time', function (this: TokenWorld, id: number): void {
  // Pair with the existing 'NetworkId.fromId is called with {int}' step from
  // token-id-derivation.steps.ts — that one stores `resolvedNetworkId` in networkIdSaltStash.
  // We capture both calls into our own stash so we can compare identity vs equality.
  const stash = getStash(this);
  stash.first = this.networkIdSaltStash?.resolvedNetworkId;
  stash.second = NetworkId.fromId(id);
});

Then('both calls return the same singleton instance', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.first && stash.second, 'first/second NetworkId missing — When steps skipped?');
  assert.strictEqual(stash.first, stash.second, 'expected NetworkId.fromId to return the same singleton across calls');
});

Then(
  'the resolved NetworkId is identity-equal to the registered constant {word}',
  function (this: TokenWorld, name: string): void {
    const stash = getStash(this);
    const expected = CONSTANT_BY_NAME[name];
    assert.ok(expected, `unknown NetworkId constant: ${name}`);
    assert.ok(stash.first, 'first NetworkId missing');
    assert.strictEqual(stash.first, expected, `expected identity equality with NetworkId.${name}`);
  },
);

Then('the two instances are NOT identity-equal', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.first && stash.second, 'first/second missing');
  assert.notStrictEqual(
    stash.first,
    stash.second,
    'expected fresh instances for custom-id NetworkId.fromId, got same reference',
  );
});

Then('the two instances are equal by value', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.first && stash.second, 'first/second missing');
  assert.ok(stash.first.equals(stash.second), 'fresh instances should still .equals() each other');
});

Given('a baseline NetworkId is built from id {int}', function (this: TokenWorld, id: number): void {
  getStash(this).baseline = NetworkId.fromId(id);
});

When('the baseline NetworkId is encoded into a trust-base JSON and decoded back', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.baseline, 'baseline missing');
  const wrongSigningService = new SigningService(SigningService.generatePrivateKey());
  const trustBase = RootTrustBase.fromJSON({
    changeRecordHash: null,
    epoch: '0',
    epochStartRound: '0',
    networkId: stash.baseline.id,
    previousEntryHash: null,
    quorumThreshold: '1',
    rootNodes: [{ nodeId: 'X', sigKey: HexConverter.encode(wrongSigningService.publicKey), stake: '1' }],
    signatures: {},
    stateHash: '00',
    version: '0',
  });
  stash.roundTripped = trustBase.networkId;
});

Then('the round-tripped NetworkId equals the baseline', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.baseline && stash.roundTripped, 'baseline/round-tripped missing');
  assert.ok(stash.roundTripped.equals(stash.baseline), 'JSON round-trip did not preserve NetworkId equality');
});
