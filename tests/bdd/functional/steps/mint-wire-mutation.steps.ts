import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { NetworkId } from '../../../../src/api/NetworkId.js';
import { SignaturePredicate } from '../../../../src/predicate/builtin/SignaturePredicate.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { TokenWorld } from '../support/World.js';

const SAMPLE_PUBKEY = HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026');
const FIXED_SALT_BYTES = new Uint8Array(32).fill(0xc3);
const FIXED_TOKEN_TYPE_BYTES = new Uint8Array(32).fill(0x3c);

interface IWireMutationStash {
  baseline: MintTransaction;
  tampered?: Uint8Array;
  thrownError?: Error;
}

function getStash(world: TokenWorld): IWireMutationStash {
  if (!world.wireMutationStash) {
    throw new Error('wireMutationStash not initialised');
  }
  return world.wireMutationStash;
}

function rebuildMintCbor(baseline: MintTransaction, overrides: { networkId?: number; salt?: Uint8Array }): Uint8Array {
  return CborSerializer.encodeTag(
    MintTransaction.CBOR_TAG,
    CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(baseline.version),
      CborSerializer.encodeUnsignedInteger(overrides.networkId ?? baseline.networkId.id),
      baseline.recipient.toCBOR(),
      overrides.salt ? CborSerializer.encodeByteString(overrides.salt) : baseline.salt.toCBOR(),
      baseline.tokenType.toCBOR(),
      CborSerializer.encodeNullable(baseline.justification, CborSerializer.encodeByteString),
      CborSerializer.encodeNullable(baseline.data, CborSerializer.encodeByteString),
    ),
  );
}

Given(
  'a baseline MintTransaction is encoded with networkId {int} and a fixed 32-byte salt',
  async function (this: TokenWorld, networkIdRaw: number): Promise<void> {
    const recipient = SignaturePredicate.create(SAMPLE_PUBKEY);
    const baseline = await MintTransaction.create(
      NetworkId.fromId(networkIdRaw),
      recipient,
      null,
      new TokenType(FIXED_TOKEN_TYPE_BYTES),
      TokenSalt.fromBytes(FIXED_SALT_BYTES),
    );
    this.wireMutationStash = { baseline };
  },
);

When(
  'the baseline CBOR is re-built with networkId replaced by {int}',
  function (this: TokenWorld, replacement: number): void {
    const stash = getStash(this);
    stash.tampered = rebuildMintCbor(stash.baseline, { networkId: replacement });
  },
);

When(
  'the baseline CBOR is re-built with the salt slot replaced by {int} random bytes',
  function (this: TokenWorld, length: number): void {
    const stash = getStash(this);
    stash.tampered = rebuildMintCbor(stash.baseline, { salt: crypto.getRandomValues(new Uint8Array(length)) });
  },
);

Then('decoding the tampered CBOR throws {string}', async function (this: TokenWorld, fragment: string): Promise<void> {
  const stash = getStash(this);
  assert.ok(stash.tampered, 'tampered CBOR missing — When step skipped?');
  try {
    await MintTransaction.fromCBOR(stash.tampered);
  } catch (e) {
    stash.thrownError = e as Error;
  }
  assert.ok(stash.thrownError, 'expected the decoder to throw');
  assert.ok(
    stash.thrownError.message.toLowerCase().includes(fragment.toLowerCase()),
    `expected "${fragment}" in "${stash.thrownError.message}"`,
  );
});
