import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { SignaturePredicate } from '../../../../src/predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../../../../src/predicate/EncodedPredicate.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { TokenWorld } from '../support/World.js';

const SAMPLE_PUBKEY = HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026');

interface IMintFieldsStash {
  built: MintTransaction;
  decoded?: MintTransaction;
}

function getStash(world: TokenWorld): IMintFieldsStash {
  if (!world.mintFieldsStash) {
    throw new Error('mintFieldsStash not initialised');
  }
  return world.mintFieldsStash;
}

function parseHexOrNull(value: string): Uint8Array | null {
  return value === 'null' ? null : HexConverter.decode(value);
}

Given(
  'a MintTransaction is built with justification {string} and data {string}',
  async function (this: TokenWorld, justification: string, data: string): Promise<void> {
    const recipient = SignaturePredicate.create(SAMPLE_PUBKEY);
    const built = await MintTransaction.create(
      recipient,
      new TokenId(new Uint8Array(32)),
      new TokenType(new Uint8Array(32)),
      parseHexOrNull(justification),
      parseHexOrNull(data),
    );
    this.mintFieldsStash = { built };
  },
);

When('the MintTransaction is encoded and decoded', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  stash.decoded = await MintTransaction.fromCBOR(stash.built.toCBOR());
});

Then('the decoded justification matches {string}', function (this: TokenWorld, expected: string): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'decoded missing');
  const expectedBytes = parseHexOrNull(expected);
  if (expectedBytes === null) {
    assert.equal(stash.decoded.justification, null);
  } else {
    assert.ok(stash.decoded.justification, 'expected non-null justification');
    assert.equal(HexConverter.encode(stash.decoded.justification), expected);
  }
});

Then('the decoded data matches {string}', function (this: TokenWorld, expected: string): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'decoded missing');
  const expectedBytes = parseHexOrNull(expected);
  if (expectedBytes === null) {
    assert.equal(stash.decoded.data, null);
  } else {
    assert.ok(stash.decoded.data, 'expected non-null data');
    assert.equal(HexConverter.encode(stash.decoded.data), expected);
  }
});

// PR #114 #113 — ITransaction.recipient / .lockScript are EncodedPredicate on the wire.
Then('the recipient is an EncodedPredicate', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.built.recipient instanceof EncodedPredicate);
});

Then('the lockScript is an EncodedPredicate', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.built.lockScript instanceof EncodedPredicate);
});

Then('the decoded recipient encodes to the original recipient bytes', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'decoded missing');
  assert.equal(
    HexConverter.encode(stash.decoded.recipient.toCBOR()),
    HexConverter.encode(stash.built.recipient.toCBOR()),
  );
});
