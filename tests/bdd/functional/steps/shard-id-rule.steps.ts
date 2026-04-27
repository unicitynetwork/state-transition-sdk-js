import { strict as assert } from 'assert';

import { Given, Then, When } from '@cucumber/cucumber';

import { ShardId } from '../../../../src/api/bft/ShardId.js';
import { ShardTreeCertificate } from '../../../../src/api/bft/ShardTreeCertificate.js';
import { StateId } from '../../../../src/api/StateId.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../src/serialization/HexConverter.js';
import { ShardIdMatchesStateIdRule } from '../../../../src/transaction/verification/rule/ShardIdMatchesStateIdRule.js';
import { TokenWorld } from '../support/World.js';

interface IShardRuleStash {
  ruleStatus?: string;
  shardIdEncoded?: Uint8Array;
  stateId?: StateId;
}

function getStash(world: TokenWorld): IShardRuleStash {
  if (!world.shardRuleStash) {
    world.shardRuleStash = {};
  }
  return world.shardRuleStash;
}

function decodeHex(hex: string): Uint8Array {
  const trimmed = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (trimmed.length === 0) {
    return new Uint8Array();
  }
  return HexConverter.decode(trimmed);
}

function makeStateId(prefix: Uint8Array): StateId {
  const data = new Uint8Array(32);
  data.set(prefix);
  return StateId.fromCBOR(CborSerializer.encodeByteString(data));
}

Given('a StateID with first byte {string}', function (this: TokenWorld, hex: string): void {
  getStash(this).stateId = makeStateId(decodeHex(hex));
});

Given('a StateID with first two bytes {string}', function (this: TokenWorld, hex: string): void {
  getStash(this).stateId = makeStateId(decodeHex(hex));
});

When('ShardIdMatchesStateIdRule.verify runs', function (this: TokenWorld): void {
  const ruleStash = getStash(this);
  const idStash = this.shardIdStash;
  assert.ok(idStash && idStash.bytes.length > 0, 'no ShardId encoding set');
  assert.ok(ruleStash.stateId, 'no StateID set');
  const shardId = ShardId.decode(idStash.bytes);
  const sibling = new Uint8Array(32);
  const cert = new ShardTreeCertificate(shardId, [sibling]);
  const result = ShardIdMatchesStateIdRule.verify(ruleStash.stateId, cert);
  ruleStash.ruleStatus = result.status;
});

Then('the rule status is {string}', function (this: TokenWorld, expected: string): void {
  const stash = getStash(this);
  assert.equal(stash.ruleStatus, expected);
});
