import { strict as assert } from 'assert';

import { Given, Then, When } from '@cucumber/cucumber';

import { StateId } from '../../../../src/api/StateId.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { ShardAwareAggregatorClient } from '../support/ShardAwareAggregatorClient.js';
import { TokenWorld } from '../support/World.js';

interface IRoutingStash {
  pickedShard?: number;
  rejectionError?: Error;
  stateId?: StateId;
  wrongShardResponseStatus?: string;
}

function getStash(world: TokenWorld): IRoutingStash {
  if (!world.routingStash) {
    world.routingStash = {};
  }
  return world.routingStash;
}

function envShardIdLength(): number {
  return parseInt(process.env.SHARD_ID_LENGTH ?? '1', 10);
}

function configuredShardIds(): number[] {
  const len = envShardIdLength();
  const baseId = 1 << len;
  const expectedCount = 1 << len;
  return Array.from({ length: expectedCount }, (_, i) => baseId + i);
}

function topBitsOfFirstByte(firstByte: number, bitCount: number): number {
  return (firstByte >>> (8 - bitCount)) & ((1 << bitCount) - 1);
}

Given('a synthetic StateID whose first byte is {string}', function (this: TokenWorld, hex: string): void {
  const trimmed = hex.startsWith('0x') ? hex.slice(2) : hex;
  const firstByte = parseInt(trimmed, 16);
  const data = new Uint8Array(32);
  data[0] = firstByte;
  getStash(this).stateId = StateId.fromCBOR(CborSerializer.encodeByteString(data));
});

When(
  'ShardAwareAggregatorClient.getShardForStateId runs in msb mode against the configured topology',
  function (this: TokenWorld): void {
    const stash = getStash(this);
    assert.ok(stash.stateId, 'no stateId set');
    stash.pickedShard = ShardAwareAggregatorClient.getShardForStateId(stash.stateId, envShardIdLength(), 'msb');
  },
);

Then("the picked shard's prefix matches the StateID's top SHARD_ID_LENGTH bits", function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.stateId && stash.pickedShard !== undefined, 'routing not run');
  const len = envShardIdLength();
  const baseId = 1 << len;
  const topBits = topBitsOfFirstByte(stash.stateId.data[0], len);
  const expected = baseId | topBits;
  assert.equal(
    stash.pickedShard,
    expected,
    `expected shard ${expected} (baseId ${baseId} | topBits ${topBits.toString(2)}), got ${stash.pickedShard}`,
  );
});

Given('a freshly minted token routed to its correct shard', async function (this: TokenWorld): Promise<void> {
  const { createUser, mintToken } = await import('../support/TestSetup.js');
  if (!this.alice) {
    this.alice = createUser();
  }
  this.token = await mintToken(this.setup, this.alice);
  const sid = await StateId.fromTransaction(this.token.genesis.transaction);
  const correctShardId = ShardAwareAggregatorClient.getShardForStateId(sid, envShardIdLength(), 'msb');
  getStash(this).stateId = sid;
  getStash(this).pickedShard = correctShardId;
});

When(
  'the same certification request is sent directly to a different shard',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    const correctShardId = stash.pickedShard;
    if (correctShardId === undefined) {
      throw new Error('correct shard ID was not stashed');
    }
    const allShards = configuredShardIds();
    const wrongShardId = allShards.find((id) => id !== correctShardId);
    if (wrongShardId === undefined) {
      throw new Error('only one shard configured — cannot test wrong-shard routing');
    }
    const wrongUrl = process.env[`SHARD_${wrongShardId}_URL`];
    if (!wrongUrl) {
      throw new Error(`SHARD_${wrongShardId}_URL not set`);
    }
    const { AggregatorClient } = await import('../../../../src/api/AggregatorClient.js');
    const client = new AggregatorClient(wrongUrl, null);
    const certData = this.token.genesis.inclusionProof.certificationData;
    if (!certData) {
      throw new Error('genesis proof has no certificationData');
    }
    try {
      const response = await client.submitCertificationRequest(certData);
      stash.wrongShardResponseStatus = response.status;
    } catch (err) {
      stash.rejectionError = err as Error;
    }
  },
);

Then('the aggregator rejects the request', function (this: TokenWorld): void {
  const stash = getStash(this);
  if (stash.rejectionError) {
    return;
  }
  assert.notEqual(
    stash.wrongShardResponseStatus,
    'SUCCESS',
    `expected wrong-shard submission to be rejected; got status ${stash.wrongShardResponseStatus}`,
  );
});

When(
  'enough tokens are minted to cover every configured shard',
  { timeout: 600_000 },
  async function (this: TokenWorld): Promise<void> {
    const { createUser, mintToken } = await import('../support/TestSetup.js');
    if (!this.alice) {
      this.alice = createUser();
    }
    const shardCount = 1 << envShardIdLength();
    const totalMints = shardCount * 8;
    this.routingShardSeen = new Set<number>();
    for (let i = 0; i < totalMints; i++) {
      const token = await mintToken(this.setup, this.alice);
      const sid = await StateId.fromTransaction(token.genesis.transaction);
      const shardId = ShardAwareAggregatorClient.getShardForStateId(sid, envShardIdLength(), 'msb');
      this.routingShardSeen.add(shardId);
    }
  },
);

Then('the per-shard submission count covers every configured shard', function (this: TokenWorld): void {
  const seen = this.routingShardSeen;
  assert.ok(seen, 'no shards observed');
  const expected = configuredShardIds();
  const missing = expected.filter((id) => !seen.has(id));
  assert.equal(
    missing.length,
    0,
    `expected mints across every configured shard (${expected.join(',')}); missing ${missing.join(',')}; saw ${[...seen].sort((a, b) => a - b).join(',')}`,
  );
});
