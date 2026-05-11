import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { SignaturePredicate } from '../../../../src/predicate/builtin/SignaturePredicate.js';
import { EncodedPredicate } from '../../../../src/predicate/EncodedPredicate.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { UnicityId } from '../../../../src/unicity-id/UnicityId.js';
import { UnicityIdMintTransaction } from '../../../../src/unicity-id/UnicityIdMintTransaction.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { TokenWorld } from '../support/World.js';

const SAMPLE_LOCK_PUBKEY = HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026');
const SAMPLE_RECIPIENT_PUBKEY = HexConverter.decode(
  '03b00b30dcd21feaa837132ccd4b7b9595f704c9714ac66eed085f52bc396f9050',
);
const SAMPLE_TARGET_PUBKEY = HexConverter.decode('02e4b1681cee95339004cce2cbee141a745ca06ec4629d4d8bb8dabf322429424f');

interface IUnicityIdFieldsStash {
  built: UnicityIdMintTransaction;
  decoded?: UnicityIdMintTransaction;
}

function getStash(world: TokenWorld): IUnicityIdFieldsStash {
  if (!world.unicityIdFieldsStash) {
    throw new Error('unicityIdFieldsStash not initialised');
  }
  return world.unicityIdFieldsStash;
}

Given(
  'a UnicityIdMintTransaction is built with a sample lockScript, recipient, unicityId, tokenType, and targetPredicate',
  async function (this: TokenWorld): Promise<void> {
    const lockScript = SignaturePredicate.create(SAMPLE_LOCK_PUBKEY);
    const recipient = SignaturePredicate.create(SAMPLE_RECIPIENT_PUBKEY);
    const targetPredicate = SignaturePredicate.create(SAMPLE_TARGET_PUBKEY);
    const built = await UnicityIdMintTransaction.create(
      lockScript,
      recipient,
      new UnicityId('alice', 'bdd/test'),
      new TokenType(new Uint8Array(32)),
      targetPredicate,
    );
    this.unicityIdFieldsStash = { built };
  },
);

When('the UnicityIdMintTransaction is encoded and decoded', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  stash.decoded = await UnicityIdMintTransaction.fromCBOR(stash.built.toCBOR());
});

Then("the decoded transaction's tokenId equals the original", function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.decoded);
  assert.equal(HexConverter.encode(stash.decoded.tokenId.bytes), HexConverter.encode(stash.built.tokenId.bytes));
});

Then("the decoded transaction's tokenType equals the original", function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.decoded);
  assert.equal(
    HexConverter.encode(stash.decoded.tokenType.toCBOR()),
    HexConverter.encode(stash.built.tokenType.toCBOR()),
  );
});

Then(
  "the decoded transaction's lockScript encodes to the original lockScript bytes",
  function (this: TokenWorld): void {
    const stash = getStash(this);
    assert.ok(stash.decoded);
    assert.equal(
      HexConverter.encode(EncodedPredicate.fromPredicate(stash.decoded.lockScript).toCBOR()),
      HexConverter.encode(EncodedPredicate.fromPredicate(stash.built.lockScript).toCBOR()),
    );
  },
);

Then("the decoded transaction's recipient encodes to the original recipient bytes", function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.decoded);
  assert.equal(
    HexConverter.encode(EncodedPredicate.fromPredicate(stash.decoded.recipient).toCBOR()),
    HexConverter.encode(EncodedPredicate.fromPredicate(stash.built.recipient).toCBOR()),
  );
});

Then(
  "the decoded transaction's targetPredicate encodes to the original targetPredicate bytes",
  function (this: TokenWorld): void {
    const stash = getStash(this);
    assert.ok(stash.decoded);
    assert.equal(
      HexConverter.encode(EncodedPredicate.fromPredicate(stash.decoded.targetPredicate).toCBOR()),
      HexConverter.encode(EncodedPredicate.fromPredicate(stash.built.targetPredicate).toCBOR()),
    );
  },
);

Then("the decoded transaction's unicityId encodes to the original unicityId bytes", function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.decoded);
  assert.equal(
    HexConverter.encode(stash.decoded.unicityId.toCBOR()),
    HexConverter.encode(stash.built.unicityId.toCBOR()),
  );
});

// PR #114 #113 — lockScript/recipient are EncodedPredicate; targetPredicate stays a SignaturePredicate.
Then('the unicity-id lockScript is an EncodedPredicate', function (this: TokenWorld): void {
  assert.ok(getStash(this).built.lockScript instanceof EncodedPredicate);
});

Then('the unicity-id recipient is an EncodedPredicate', function (this: TokenWorld): void {
  assert.ok(getStash(this).built.recipient instanceof EncodedPredicate);
});

Then(
  'the unicity-id targetPredicate is a SignaturePredicate, not an EncodedPredicate',
  function (this: TokenWorld): void {
    const built = getStash(this).built;
    assert.ok(built.targetPredicate instanceof SignaturePredicate);
    assert.ok(!(built.targetPredicate instanceof EncodedPredicate));
  },
);
