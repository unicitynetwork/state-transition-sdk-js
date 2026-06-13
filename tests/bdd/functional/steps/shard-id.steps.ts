import { strict as assert } from 'assert';

import { Given, Then, When } from '@cucumber/cucumber';

import { ShardId } from '../../../../src/api/bft/ShardId.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { TokenWorld } from '../support/World.js';

interface IShardIdStash {
  bytes: Uint8Array;
  data?: Uint8Array;
  decodeError?: Error;
  decoded?: ShardId;
}

function getStash(world: TokenWorld): IShardIdStash {
  if (!world.shardIdStash) {
    world.shardIdStash = { bytes: new Uint8Array() };
  }
  return world.shardIdStash;
}

function decodeHex(hex: string): Uint8Array {
  const trimmed = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (trimmed.length === 0) {
    return new Uint8Array();
  }
  return HexConverter.decode(trimmed);
}

Given('a ShardId encoded as {string}', function (this: TokenWorld, hex: string): void {
  const stash = getStash(this);
  stash.bytes = decodeHex(hex);
  stash.decoded = undefined;
  stash.decodeError = undefined;
});

Given(
  'a ShardId encoded as {string} describing {int} bits',
  function (this: TokenWorld, hex: string, expectedLength: number): void {
    const stash = getStash(this);
    stash.bytes = decodeHex(hex);
    stash.decoded = ShardId.decode(stash.bytes);
    assert.equal(
      stash.decoded.length,
      expectedLength,
      `expected length ${expectedLength}, got ${stash.decoded.length}`,
    );
  },
);

Given('data starting with {string}', function (this: TokenWorld, hex: string): void {
  const prefix = decodeHex(hex);
  const data = new Uint8Array(32);
  data.set(prefix);
  getStash(this).data = data;
});

When('the ShardId is decoded', function (this: TokenWorld): void {
  const stash = getStash(this);
  try {
    stash.decoded = ShardId.decode(stash.bytes);
  } catch (err) {
    stash.decodeError = err as Error;
  }
});

When('isPrefixOf is checked', function (this: TokenWorld): void {
  const stash = getStash(this);
  if (!stash.decoded) {
    stash.decoded = ShardId.decode(stash.bytes);
  }
});

Then('the ShardId length is {int}', function (this: TokenWorld, expected: number): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'ShardId was not decoded');
  assert.equal(stash.decoded.length, expected);
});

Then('re-encoding the ShardId produces {string}', function (this: TokenWorld, hex: string): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'ShardId was not decoded');
  const expected = decodeHex(hex);
  const actual = stash.decoded.encode();
  assert.deepEqual(Array.from(actual), Array.from(expected), `expected ${hex}, got 0x${HexConverter.encode(actual)}`);
});

Then('isPrefixOf returns {word}', function (this: TokenWorld, expected: string): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'ShardId was not decoded');
  assert.ok(stash.data, 'data was not set');
  const result = stash.decoded.isPrefixOf(stash.data);
  assert.equal(result, expected === 'true');
});

Then('getBit at index {int} returns {int}', function (this: TokenWorld, index: number, expected: number): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'ShardId was not decoded');
  assert.equal(stash.decoded.getBit(index), expected);
});

Then('getBit at index {int} throws {string}', function (this: TokenWorld, index: number, fragment: string): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'ShardId was not decoded');
  assert.throws(
    () => stash.decoded!.getBit(index),
    (err: Error) => err.message.toLowerCase().includes(fragment.toLowerCase()),
  );
});

Then('decoding throws with message containing {string}', function (this: TokenWorld, fragment: string): void {
  const stash = getStash(this);
  assert.ok(stash.decodeError, 'expected decode to throw, but it did not');
  assert.ok(
    stash.decodeError.message.toLowerCase().includes(fragment.toLowerCase()),
    `expected error to contain "${fragment}", got "${stash.decodeError.message}"`,
  );
});
