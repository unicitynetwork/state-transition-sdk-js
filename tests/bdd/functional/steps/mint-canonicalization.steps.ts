import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { NetworkId } from '../../../../src/api/NetworkId.js';
import { SignaturePredicate } from '../../../../src/predicate/builtin/SignaturePredicate.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { TokenWorld } from '../support/World.js';

const SAMPLE_PUBKEY = HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026');
const FIXED_SALT_BYTES = new Uint8Array(32).fill(0xa5);
const FIXED_TOKEN_TYPE_BYTES = new Uint8Array(32).fill(0x5a);

interface ICanonicalStash {
  encoded: Uint8Array;
  reEncoded?: Uint8Array;
  twin?: MintTransaction;
  twinTokenId?: import('../../../../src/transaction/TokenId.js').TokenId;
}

function getStash(world: TokenWorld): ICanonicalStash {
  if (!world.mintCanonicalStash) {
    throw new Error('mintCanonicalStash not initialised — run the Given step first');
  }
  return world.mintCanonicalStash;
}

function parseHexOrNull(value: string): Uint8Array | null {
  return value === 'null' ? null : HexConverter.decode(value);
}

Given(
  'a MintTransaction is built with networkId {int}, a fixed salt, and a fixed tokenType',
  async function (this: TokenWorld, networkIdRaw: number): Promise<void> {
    const recipient = SignaturePredicate.create(SAMPLE_PUBKEY);
    const built = await MintTransaction.create(
      NetworkId.fromId(networkIdRaw),
      recipient,
      null,
      new TokenType(FIXED_TOKEN_TYPE_BYTES),
      TokenSalt.fromBytes(FIXED_SALT_BYTES),
    );
    this.mintCanonicalStash = { encoded: built.toCBOR() };
  },
);

Given(
  'a MintTransaction is built with networkId {int}, fixed salt, justification {string} and data {string}',
  async function (this: TokenWorld, networkIdRaw: number, justification: string, data: string): Promise<void> {
    const recipient = SignaturePredicate.create(SAMPLE_PUBKEY);
    const built = await MintTransaction.create(
      NetworkId.fromId(networkIdRaw),
      recipient,
      parseHexOrNull(data),
      new TokenType(FIXED_TOKEN_TYPE_BYTES),
      TokenSalt.fromBytes(FIXED_SALT_BYTES),
      parseHexOrNull(justification),
    );
    this.mintCanonicalStash = { encoded: built.toCBOR() };
  },
);

Given(
  'two MintTransactions are built independently with the same networkId {int}, salt, recipient, and tokenType',
  async function (this: TokenWorld, networkIdRaw: number): Promise<void> {
    const recipient = SignaturePredicate.create(SAMPLE_PUBKEY);
    const build = (): Promise<MintTransaction> =>
      MintTransaction.create(
        NetworkId.fromId(networkIdRaw),
        recipient,
        null,
        new TokenType(FIXED_TOKEN_TYPE_BYTES),
        TokenSalt.fromBytes(FIXED_SALT_BYTES),
      );
    const first = await build();
    const second = await build();
    this.mintCanonicalStash = { encoded: first.toCBOR(), twin: second, twinTokenId: second.tokenId };
    this.mintTokenId = first.tokenId;
  },
);

When('the MintTransaction is re-encoded after decoding', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  const decoded = await MintTransaction.fromCBOR(stash.encoded);
  stash.reEncoded = decoded.toCBOR();
});

Then('the re-encoded CBOR bytes are byte-identical to the original', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.reEncoded, 'reEncoded missing — When step skipped?');
  assert.strictEqual(
    HexConverter.encode(stash.reEncoded),
    HexConverter.encode(stash.encoded),
    'MintTransaction encode→decode→re-encode is not canonical-byte-stable',
  );
});

Then('both MintTransactions encode to byte-identical CBOR', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.twin, 'twin missing');
  assert.strictEqual(
    HexConverter.encode(stash.twin.toCBOR()),
    HexConverter.encode(stash.encoded),
    'two independent builds with identical logical inputs produced different CBOR — toCBOR is non-deterministic',
  );
});

Then('both MintTransactions derive the same tokenId', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.twinTokenId, 'twinTokenId missing');
  assert.ok(this.mintTokenId.equals(stash.twinTokenId), 'tokenIds differ between two builds with identical inputs');
});
