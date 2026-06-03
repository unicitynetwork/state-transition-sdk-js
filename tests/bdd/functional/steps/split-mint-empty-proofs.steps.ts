import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { SplitMintJustification } from '../../../../src/payment/SplitMintJustification.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { Token } from '../../../../src/transaction/Token.js';
import { TokenWorld } from '../support/World.js';

interface IEmptyProofsStash {
  decodeError?: Error;
  rewrittenCbor?: Uint8Array;
  thrownError?: Error;
  token?: Token;
}

function getStash(world: TokenWorld): IEmptyProofsStash {
  world.emptyProofsStash ??= {};
  return world.emptyProofsStash;
}

When(
  'SplitMintJustification.create is called in isolation with a null token and an empty proof list',
  function (this: TokenWorld): void {
    const stash = getStash(this);
    try {
      SplitMintJustification.create(null as unknown as Token, []);
    } catch (e) {
      stash.thrownError = e as Error;
    }
  },
);

Then('SplitMintJustification.create throws {string}', function (this: TokenWorld, fragment: string): void {
  const stash = getStash(this);
  assert.ok(stash.thrownError, 'expected create() to throw');
  assert.ok(
    stash.thrownError.message.toLowerCase().includes(fragment.toLowerCase()),
    `expected "${fragment}" in "${stash.thrownError.message}"`,
  );
});

Given('an arbitrary single-token SplitMintJustification is encoded to CBOR', function (this: TokenWorld): void {
  if (!this.splitJustificationStash) {
    throw new Error(
      'requires Background "Alice has split-minted 2 tokens with 2 payment assets" from split-mint-justification.steps.ts',
    );
  }
  getStash(this).token = this.splitJustificationStash.decoded.token;
});

When('the CBOR is rewritten with an empty proofs array', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.token, 'token missing — Given step skipped?');
  // Re-encode the SplitMintJustification CBOR shape — tag 39044 wrapping [token, proofsArray] —
  // with proofsArray emptied. Surgical mutation: keep the valid token, swap the proofs list.
  stash.rewrittenCbor = CborSerializer.encodeTag(
    SplitMintJustification.CBOR_TAG,
    CborSerializer.encodeArray(stash.token.toCBOR(), CborSerializer.encodeArray()),
  );
});

Then(
  'SplitMintJustification.fromCBOR should reject the empty-proofs payload',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    assert.ok(stash.rewrittenCbor, 'rewritten CBOR missing — When step skipped?');
    try {
      await SplitMintJustification.fromCBOR(stash.rewrittenCbor);
    } catch (e) {
      stash.decodeError = e as Error;
    }
    assert.ok(
      stash.decodeError,
      'BUG: SplitMintJustification.fromCBOR accepted an empty proofs array, bypassing the create() invariant. ' +
        'See split-mint-justification.feature — `SplitMintJustification.create([])` correctly throws ' +
        '"proofs cannot be empty." but fromCBOR at SplitMintJustification.ts:58 routes around create(). ' +
        'Fix: route fromCBOR through create() or duplicate the proofs.length>0 check.',
    );
  },
);
