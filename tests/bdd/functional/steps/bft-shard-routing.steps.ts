import { strict as assert } from 'assert';

import { Given, Then, When } from '@cucumber/cucumber';

import { StateId } from '../../../../src/api/StateId.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../../src/serialization/HexConverter.js';
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

Given('a synthetic StateID whose first byte is {string}', function (this: TokenWorld, hex: string): void {
  const trimmed = hex.startsWith('0x') ? hex.slice(2) : hex;
  const firstByte = parseInt(trimmed, 16);
  const data = new Uint8Array(32);
  data[0] = firstByte;
  getStash(this).stateId = StateId.fromCBOR(CborSerializer.encodeByteString(data));
});

When(
  'ShardAwareAggregatorClient.getShardForStateId runs in {string} mode with shardIdLength {int}',
  function (this: TokenWorld, mode: string, shardIdLength: number): void {
    const stash = getStash(this);
    assert.ok(stash.stateId, 'no stateId set');
    if (mode !== 'msb' && mode !== 'lsb') {
      throw new Error(`unknown mode ${mode}`);
    }
    stash.pickedShard = ShardAwareAggregatorClient.getShardForStateId(stash.stateId, shardIdLength, mode);
  },
);

Then('the picked shard is {int}', function (this: TokenWorld, expected: number): void {
  assert.equal(getStash(this).pickedShard, expected);
});

Given(
  'a freshly minted token whose StateID would route to shard {int}',
  async function (this: TokenWorld, shardId: number): Promise<void> {
    // mint until we get a token whose StateID routes to the requested shard under MSB mode.
    if (!this.alice) {
      const { createUser, mintToken } = await import('../support/TestSetup.js');
      this.alice = createUser();
      let attempts = 0;
      while (attempts < 50) {
        attempts++;
        this.token = await mintToken(this.setup, this.alice);
        const sid = await StateId.fromTransaction(this.token.genesis.transaction);
        const computed = ShardAwareAggregatorClient.getShardForStateId(sid, 1, 'msb');
        if (computed === shardId) {
          getStash(this).stateId = sid;
          return;
        }
      }
      throw new Error(`could not mint a token routing to shard ${shardId} after 50 attempts`);
    }
  },
);

When(
  'the same certification request is sent directly to shard {int}',
  async function (this: TokenWorld, wrongShard: number): Promise<void> {
    const stash = getStash(this);
    const { AggregatorClient } = await import('../../../../src/api/AggregatorClient.js');
    const wrongUrl = process.env[`SHARD_${wrongShard}_URL`];
    if (!wrongUrl) {
      throw new Error(`SHARD_${wrongShard}_URL not set`);
    }
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

Then('the aggregator rejects the request with a shard-related error', function (this: TokenWorld): void {
  const stash = getStash(this);
  // The aggregator may either throw (network-layer error) or return a non-SUCCESS status.
  // We accept either a thrown shard-related error, or any non-SUCCESS status (the wrong
  // shard cannot legitimately accept this request — the StateID's bit prefix doesn't match).
  if (stash.rejectionError) {
    const lower = stash.rejectionError.message.toLowerCase();
    assert.ok(
      lower.includes('shard') || lower.includes('routing') || lower.includes('mismatch'),
      `expected shard-related error, got "${stash.rejectionError.message}"`,
    );
    return;
  }
  assert.notEqual(
    stash.wrongShardResponseStatus,
    'SUCCESS',
    `expected wrong-shard submission to be rejected; got status ${stash.wrongShardResponseStatus}`,
  );
});

When(
  '{int} tokens are minted in a row',
  { timeout: 600_000 },
  async function (this: TokenWorld, count: number): Promise<void> {
    const { createUser, mintToken } = await import('../support/TestSetup.js');
    if (!this.alice) {
      this.alice = createUser();
    }
    this.routingShardSeen = new Set<number>();
    for (let i = 0; i < count; i++) {
      const token = await mintToken(this.setup, this.alice);
      const sid = await StateId.fromTransaction(token.genesis.transaction);
      const shardId = ShardAwareAggregatorClient.getShardForStateId(sid, 1, 'msb');
      this.routingShardSeen.add(shardId);
    }
  },
);

Then('the per-shard submission count for both shards is greater than 0', function (this: TokenWorld): void {
  const seen = this.routingShardSeen;
  assert.ok(seen, 'no shards observed');
  assert.equal(seen.size, 2, `expected mints across both shards (2 and 3), saw ${[...seen].join(',')}`);
});

// silence unused-import warning for HexConverter (kept for future synthetic-stateid scenarios)
void HexConverter;
