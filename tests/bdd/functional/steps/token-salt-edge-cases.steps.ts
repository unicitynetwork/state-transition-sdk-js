import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { TokenSalt } from '../../../../src/transaction/TokenSalt.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { TokenWorld } from '../support/World.js';

interface ITokenSaltEdgeStash {
  generated?: TokenSalt[];
  inputBuffer?: Uint8Array;
  originalHex?: string;
  outputBuffer?: Uint8Array;
  salt?: TokenSalt;
}

function getStash(world: TokenWorld): ITokenSaltEdgeStash {
  world.tokenSaltEdgeStash ??= {};
  return world.tokenSaltEdgeStash;
}

Given('a 32-byte input buffer is filled with {word}', function (this: TokenWorld, byteHex: string): void {
  // Cucumber word matches 0xA1 etc.; strip the 0x prefix and parse.
  const byte = parseInt(byteHex.replace(/^0x/i, ''), 16);
  assert.ok(byte >= 0 && byte <= 0xff, `invalid byte literal: ${byteHex}`);
  const buffer = new Uint8Array(32).fill(byte);
  getStash(this).inputBuffer = buffer;
  getStash(this).originalHex = HexConverter.encode(buffer);
});

Given('TokenSalt.fromBytes is called on the input buffer', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.inputBuffer, 'inputBuffer missing — Given step skipped?');
  stash.salt = TokenSalt.fromBytes(stash.inputBuffer);
});

When('the input buffer is mutated to all 0x00 after construction', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.inputBuffer, 'inputBuffer missing');
  stash.inputBuffer.fill(0x00);
});

When('the bytes returned by toBytes are mutated to all 0x00', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.salt, 'salt missing');
  stash.outputBuffer = stash.salt.toBytes();
  stash.outputBuffer.fill(0x00);
});

Then('the TokenSalt still encodes to its original {word} bytes', function (this: TokenWorld, byteHex: string): void {
  const stash = getStash(this);
  assert.ok(stash.salt && stash.originalHex, 'salt/originalHex missing');
  const fresh = HexConverter.encode(stash.salt.toBytes());
  assert.strictEqual(
    fresh,
    stash.originalHex,
    `TokenSalt was mutated externally — defensive-copy contract broken (expected all-${byteHex})`,
  );
});

When('TokenSalt.generate is called {int} times', function (this: TokenWorld, n: number): void {
  const stash = getStash(this);
  stash.generated = Array.from({ length: n }, () => TokenSalt.generate());
});

Then('no two of the generated salts are byte-identical', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.generated, 'generated missing');
  const seen = new Set<string>();
  for (const salt of stash.generated) {
    const hex = HexConverter.encode(salt.toBytes());
    assert.ok(!seen.has(hex), `TokenSalt.generate produced a duplicate: ${hex.slice(0, 16)}…`);
    seen.add(hex);
  }
});
