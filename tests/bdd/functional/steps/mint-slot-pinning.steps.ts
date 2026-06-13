import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { NetworkId } from '../../../../src/api/NetworkId.js';
import { SignaturePredicate } from '../../../../src/predicate/builtin/SignaturePredicate.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { TokenWorld } from '../support/World.js';

// Asymmetric, pairwise-distinguishable per-field inputs. Each field gets a unique byte pattern
// so that any encoder/decoder slot swap is observable in the decoded value.
const NETWORK_ID = 7;
const RECIPIENT_PUBKEY = HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026');
const SALT_BYTES = new Uint8Array(32).fill(0xaa);
const TOKEN_TYPE_BYTES = new Uint8Array(32).fill(0xbb);
const JUSTIFICATION_BYTES = new Uint8Array([0xcc]);
const DATA_BYTES = new Uint8Array([0xdd]);

interface ISlotPinningStash {
  built: MintTransaction;
  decoded?: MintTransaction;
  originalRecipientHex: string;
}

function getStash(world: TokenWorld): ISlotPinningStash {
  if (!world.slotPinningStash) {
    throw new Error('slotPinningStash not initialised');
  }
  return world.slotPinningStash;
}

Given('a MintTransaction is built with asymmetric per-field inputs', async function (this: TokenWorld): Promise<void> {
  const recipient = SignaturePredicate.create(RECIPIENT_PUBKEY);
  const built = await MintTransaction.create(
    NetworkId.fromId(NETWORK_ID),
    recipient,
    DATA_BYTES,
    new TokenType(TOKEN_TYPE_BYTES),
    TokenSalt.fromBytes(SALT_BYTES),
    JUSTIFICATION_BYTES,
  );
  this.slotPinningStash = {
    built,
    originalRecipientHex: HexConverter.encode(built.recipient.toCBOR()),
  };
});

When('the MintTransaction round-trips through CBOR for slot-pinning', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  stash.decoded = await MintTransaction.fromCBOR(stash.built.toCBOR());
});

Then('the decoded networkId has id {int}', function (this: TokenWorld, expected: number): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'decoded missing');
  assert.strictEqual(
    stash.decoded.networkId.id,
    expected,
    `slot 1 (networkId) drifted: expected ${expected}, got ${stash.decoded.networkId.id} — possible slot swap`,
  );
});

Then('the decoded recipient encodes to the same bytes as the original recipient', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'decoded missing');
  assert.strictEqual(
    HexConverter.encode(stash.decoded.recipient.toCBOR()),
    stash.originalRecipientHex,
    'slot 2 (recipient) drifted — possible slot swap',
  );
});

Then('the decoded salt encodes to 32 bytes of {word}', function (this: TokenWorld, byteHex: string): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'decoded missing');
  const byte = parseInt(byteHex.replace(/^0x/i, ''), 16);
  const expected = HexConverter.encode(new Uint8Array(32).fill(byte));
  assert.strictEqual(
    HexConverter.encode(stash.decoded.salt.toBytes()),
    expected,
    `slot 3 (salt) drifted: expected all-${byteHex}, got something else — possible slot swap with tokenType`,
  );
});

Then('the decoded tokenType encodes to 32 bytes of {word}', function (this: TokenWorld, byteHex: string): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'decoded missing');
  const byte = parseInt(byteHex.replace(/^0x/i, ''), 16);
  const expected = HexConverter.encode(new Uint8Array(32).fill(byte));
  // TokenType exposes its bytes via CBOR; decode the byteString back out for the comparison.
  const decodedHex = HexConverter.encode(stash.decoded.tokenType.bytes);
  assert.strictEqual(
    decodedHex,
    expected,
    `slot 4 (tokenType) drifted: expected all-${byteHex}, got something else — possible slot swap with salt`,
  );
});

Then('the decoded justification is exactly {string}', function (this: TokenWorld, expectedHex: string): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'decoded missing');
  assert.ok(stash.decoded.justification, 'expected non-null justification');
  assert.strictEqual(
    HexConverter.encode(stash.decoded.justification),
    expectedHex,
    'slot 5 (justification) drifted — possible slot swap with data',
  );
});

Then('the decoded data is exactly {string}', function (this: TokenWorld, expectedHex: string): void {
  const stash = getStash(this);
  assert.ok(stash.decoded, 'decoded missing');
  assert.ok(stash.decoded.data, 'expected non-null data');
  assert.strictEqual(
    HexConverter.encode(stash.decoded.data),
    expectedHex,
    'slot 6 (data) drifted — possible slot swap with justification',
  );
});
