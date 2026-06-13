import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { NetworkId } from '../../../../src/api/NetworkId.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenSalt } from '../../../../src/transaction/TokenSalt.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { createUser } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

// A pinned 32-byte salt used by the "fixed salt" scenarios so the assertions are reproducible.
const FIXED_SALT_BYTES = new Uint8Array(32).fill(0x7a);

function getStash(world: TokenWorld): NonNullable<TokenWorld['networkIdSaltStash']> {
  world.networkIdSaltStash ??= {};
  return world.networkIdSaltStash;
}

When('NetworkId.fromId is called with {int}', function (this: TokenWorld, id: number): void {
  const stash = getStash(this);
  try {
    stash.resolvedNetworkId = NetworkId.fromId(id);
  } catch (error) {
    stash.thrownError = error instanceof Error ? error : new Error(String(error));
  }
});

Then('NetworkId construction throws {string}', function (this: TokenWorld, fragment: string): void {
  const stash = getStash(this);
  assert.ok(stash.thrownError, 'expected an error from NetworkId.fromId, got none');
  assert.ok(
    stash.thrownError.message.includes(fragment),
    `expected message to contain "${fragment}", got "${stash.thrownError.message}"`,
  );
});

Then('it resolves to {word}', function (this: TokenWorld, constantName: string): void {
  const stash = getStash(this);
  assert.ok(stash.resolvedNetworkId, 'expected NetworkId.fromId to resolve, but it threw or was never called');
  const expected =
    constantName === 'MAINNET'
      ? NetworkId.MAINNET
      : constantName === 'TESTNET'
        ? NetworkId.TESTNET
        : constantName === 'LOCAL'
          ? NetworkId.LOCAL
          : null;
  assert.ok(expected, `unknown NetworkId constant: ${constantName}`);
  assert.ok(
    stash.resolvedNetworkId.equals(expected),
    `expected ${expected.toString()}, got ${stash.resolvedNetworkId.toString()}`,
  );
});

Then('the resolved NetworkId has id {int}', function (this: TokenWorld, id: number): void {
  const stash = getStash(this);
  assert.ok(stash.resolvedNetworkId, 'expected NetworkId.fromId to resolve');
  assert.strictEqual(stash.resolvedNetworkId.id, id);
});

When(
  'TokenId.fromSalt is computed for the fixed salt and networkId {int}',
  async function (this: TokenWorld, networkIdNum: number): Promise<void> {
    const stash = getStash(this);
    const networkId = NetworkId.fromId(networkIdNum);
    const salt = TokenSalt.fromBytes(FIXED_SALT_BYTES);
    const tokenId = await TokenId.fromSalt(networkId, salt);
    if (!stash.tokenIdPair) {
      stash.tokenIdPair = { first: tokenId };
    } else {
      stash.tokenIdPair.second = tokenId;
    }
  },
);

Then('the two derived tokenIds are different', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.tokenIdPair?.first && stash.tokenIdPair.second, 'both tokenIds must be set');
  assert.notStrictEqual(
    HexConverter.encode(stash.tokenIdPair.first.bytes),
    HexConverter.encode(stash.tokenIdPair.second.bytes),
    'salt+networkId derivation must produce DIFFERENT tokenIds for DIFFERENT networks (malleability guard)',
  );
});

Then('the two derived tokenIds are equal', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.tokenIdPair?.first && stash.tokenIdPair.second, 'both tokenIds must be set');
  assert.strictEqual(
    HexConverter.encode(stash.tokenIdPair.first.bytes),
    HexConverter.encode(stash.tokenIdPair.second.bytes),
    'salt+networkId derivation must be deterministic for the SAME inputs',
  );
});

When('TokenSalt.fromBytes is called with a {int}-byte input', function (this: TokenWorld, length: number): void {
  const stash = getStash(this);
  try {
    TokenSalt.fromBytes(new Uint8Array(length));
  } catch (error) {
    stash.thrownError = error instanceof Error ? error : new Error(String(error));
  }
});

Then('TokenSalt construction throws {string}', function (this: TokenWorld, fragment: string): void {
  const stash = getStash(this);
  assert.ok(stash.thrownError, 'expected an error from TokenSalt.fromBytes, got none');
  assert.ok(
    stash.thrownError.message.includes(fragment),
    `expected message to contain "${fragment}", got "${stash.thrownError.message}"`,
  );
});

When('TokenSalt.generate is invoked', function (this: TokenWorld): void {
  getStash(this).generatedSalt = TokenSalt.generate();
});

Then('the resulting salt is {int} bytes', function (this: TokenWorld, length: number): void {
  const stash = getStash(this);
  assert.ok(stash.generatedSalt, 'TokenSalt.generate was not invoked');
  assert.strictEqual(stash.generatedSalt.toCBOR().length - 2, length, 'TokenSalt should wrap exactly N raw bytes');
});

Given(
  'a MintTransaction is built with networkId {int} and a fixed salt',
  async function (this: TokenWorld, networkIdNum: number): Promise<void> {
    const stash = getStash(this);
    const networkId = NetworkId.fromId(networkIdNum);
    const salt = TokenSalt.fromBytes(FIXED_SALT_BYTES);
    const built = await MintTransaction.create(networkId, createUser().predicate, null, undefined, salt);
    stash.mintRoundtrip = { built };
    stash.fixedSalt = salt;
    stash.fixedNetworkId = networkId;
  },
);

When('the MintTransaction round-trips through CBOR', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  assert.ok(stash.mintRoundtrip, 'mintRoundtrip not initialised');
  stash.mintRoundtrip.decoded = await MintTransaction.fromCBOR(stash.mintRoundtrip.built.toCBOR());
});

Then("the decoded transaction's networkId equals the original", function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.mintRoundtrip?.decoded, 'decoded missing');
  assert.ok(
    stash.mintRoundtrip.decoded.networkId.equals(stash.mintRoundtrip.built.networkId),
    `networkId mismatch: ${stash.mintRoundtrip.decoded.networkId.toString()} vs ${stash.mintRoundtrip.built.networkId.toString()}`,
  );
});

Then("the decoded transaction's salt encodes to the original salt bytes", function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.mintRoundtrip?.decoded, 'decoded missing');
  assert.strictEqual(
    HexConverter.encode(stash.mintRoundtrip.decoded.salt.toCBOR()),
    HexConverter.encode(stash.mintRoundtrip.built.salt.toCBOR()),
  );
});

Then("the decoded transaction's tokenId equals the original tokenId", function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.mintRoundtrip?.decoded, 'decoded missing');
  assert.strictEqual(
    HexConverter.encode(stash.mintRoundtrip.decoded.tokenId.bytes),
    HexConverter.encode(stash.mintRoundtrip.built.tokenId.bytes),
  );
});

Then(
  "the mint's tokenId equals an independent TokenId.fromSalt derivation",
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    assert.ok(stash.mintRoundtrip?.built, 'mint not built');
    assert.ok(stash.fixedSalt && stash.fixedNetworkId, 'fixedSalt/fixedNetworkId missing');
    const independentlyDerived = await TokenId.fromSalt(stash.fixedNetworkId, stash.fixedSalt);
    assert.strictEqual(
      HexConverter.encode(stash.mintRoundtrip.built.tokenId.bytes),
      HexConverter.encode(independentlyDerived.bytes),
      'mint.tokenId must equal an independently-computed TokenId.fromSalt(networkId, salt)',
    );
  },
);

Given('a MintTransaction is built without an explicit salt', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  const built = await MintTransaction.create(NetworkId.LOCAL, createUser().predicate);
  stash.mintRoundtrip = { built };
});

Then("the mint's salt is {int} bytes", function (this: TokenWorld, length: number): void {
  const stash = getStash(this);
  assert.ok(stash.mintRoundtrip?.built, 'mint not built');
  // TokenSalt.toCBOR is a CBOR byte string of N bytes; subtract the byte-string header for raw length.
  assert.strictEqual(stash.mintRoundtrip.built.salt.toCBOR().length - 2, length);
});
