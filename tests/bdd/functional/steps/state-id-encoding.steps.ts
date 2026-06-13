import { strict as assert } from 'assert';

import { Given, Then, When } from '@cucumber/cucumber';

import { StateId } from '../../../../src/api/StateId.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { TokenWorld } from '../support/World.js';

interface IStateIdEncodingStash {
  bytes: Uint8Array;
  decodeError?: Error;
  decoded?: StateId;
}

function getStash(world: TokenWorld): IStateIdEncodingStash {
  if (!world.stateIdEncodingStash) {
    world.stateIdEncodingStash = { bytes: new Uint8Array() };
  }
  return world.stateIdEncodingStash;
}

Given('a CBOR byte string of length {int}', function (this: TokenWorld, length: number): void {
  const stash = getStash(this);
  stash.bytes = CborSerializer.encodeByteString(new Uint8Array(length));
  stash.decodeError = undefined;
  stash.decoded = undefined;
});

Given(
  'a CBOR byte string of length {int} starting with the sha256 algorithm prefix',
  function (this: TokenWorld, length: number): void {
    const stash = getStash(this);
    const inner = new Uint8Array(length);
    inner[0] = 0x12;
    inner[1] = 0x20;
    stash.bytes = CborSerializer.encodeByteString(inner);
    stash.decodeError = undefined;
    stash.decoded = undefined;
  },
);

When('StateId.fromCBOR is invoked', function (this: TokenWorld): void {
  const stash = getStash(this);
  try {
    stash.decoded = StateId.fromCBOR(stash.bytes);
  } catch (err) {
    stash.decodeError = err as Error;
  }
});

Then('the StateId decode succeeds', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, `expected success, but got ${stash.decodeError?.message}`);
});

Then('the StateId decode throws with message containing {string}', function (this: TokenWorld, fragment: string): void {
  const stash = getStash(this);
  assert.ok(stash.decodeError, 'expected decode to throw, but it did not');
  assert.ok(
    stash.decodeError.message.toLowerCase().includes(fragment.toLowerCase()),
    `expected "${fragment}", got "${stash.decodeError.message}"`,
  );
});
