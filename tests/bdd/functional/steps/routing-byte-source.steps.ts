import { strict as assert } from 'assert';

import { Given, Then, When } from '@cucumber/cucumber';

import { StateId } from '../../../../src/api/StateId.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { ShardAwareAggregatorClient } from '../support/ShardAwareAggregatorClient.js';
import { TokenWorld } from '../support/World.js';

interface IRoutingPinStash {
  pickedShard?: number;
  stateId?: StateId;
}

function getStash(world: TokenWorld): IRoutingPinStash {
  if (!world.routingPinStash) {
    world.routingPinStash = {};
  }
  return world.routingPinStash;
}

function parseHexByte(hex: string): number {
  const trimmed = hex.startsWith('0x') ? hex.slice(2) : hex;
  return parseInt(trimmed, 16);
}

Given(
  'a synthetic StateID with byte 0 {string} and byte 31 {string}',
  function (this: TokenWorld, byte0Hex: string, byte31Hex: string): void {
    const data = new Uint8Array(32);
    data[0] = parseHexByte(byte0Hex);
    data[31] = parseHexByte(byte31Hex);
    getStash(this).stateId = StateId.fromCBOR(CborSerializer.encodeByteString(data));
  },
);

When(
  'ShardAwareAggregatorClient.getShardForStateId runs in {word} mode with shardIdLength {int}',
  function (this: TokenWorld, mode: string, shardIdLength: number): void {
    const stash = getStash(this);
    assert.ok(stash.stateId, 'no stateId set');
    if (mode !== 'lsb' && mode !== 'msb') {
      throw new Error(`unknown routing mode ${mode}`);
    }
    stash.pickedShard = ShardAwareAggregatorClient.getShardForStateId(stash.stateId, shardIdLength, mode);
  },
);

Then('the picked shard equals {int}', function (this: TokenWorld, expected: number): void {
  const stash = getStash(this);
  assert.equal(
    stash.pickedShard,
    expected,
    `expected shard ${expected}, got ${stash.pickedShard} (byte 0 = ${stash.stateId?.data[0].toString(16)}, byte 31 = ${stash.stateId?.data[31].toString(16)})`,
  );
});

Then('the picked shard is one of {string}', function (this: TokenWorld, csv: string): void {
  const stash = getStash(this);
  const allowed = csv.split(',').map((s) => parseInt(s.trim(), 10));
  assert.ok(
    stash.pickedShard !== undefined && allowed.includes(stash.pickedShard),
    `expected shard in {${allowed.join(',')}}, got ${stash.pickedShard}`,
  );
});
