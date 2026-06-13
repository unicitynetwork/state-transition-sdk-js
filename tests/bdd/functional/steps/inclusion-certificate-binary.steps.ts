import { strict as assert } from 'assert';

import { Given, Then, When } from '@cucumber/cucumber';

import { InclusionCertificate } from '../../../../src/api/InclusionCertificate.js';
import { StateId } from '../../../../src/api/StateId.js';
import { DataHash } from '../../../../src/crypto/hash/DataHash.js';
import { DataHasherFactory } from '../../../../src/crypto/hash/DataHasherFactory.js';
import { HashAlgorithm } from '../../../../src/crypto/hash/HashAlgorithm.js';
import { NodeDataHasher } from '../../../../src/crypto/hash/NodeDataHasher.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { SparseMerkleTree } from '../../../../src/smt/radix/SparseMerkleTree.js';
import { TokenWorld } from '../support/World.js';

interface IInclusionCertStash {
  bitmap?: Uint8Array;
  bytes?: Uint8Array;
  cert?: InclusionCertificate;
  decodeError?: Error;
  leafKey?: Uint8Array;
  leafValue?: DataHash;
  rootHash?: DataHash;
  siblingCount?: number;
  verifyResult?: boolean;
}

function getStash(world: TokenWorld): IInclusionCertStash {
  if (!world.inclusionCertStash) {
    world.inclusionCertStash = {};
  }
  return world.inclusionCertStash;
}

async function buildFixtureCertificate(): Promise<{
  cert: InclusionCertificate;
  key: Uint8Array;
  root: DataHash;
  value: DataHash;
}> {
  const smt = new SparseMerkleTree(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));
  // Three leaves so the resulting cert has a non-empty bitmap and at least one sibling
  const leaves = [
    {
      key: new Uint8Array(32).fill(0xaa),
      value: new Uint8Array(32).fill(0x11),
    },
    {
      key: new Uint8Array(32).fill(0x55),
      value: new Uint8Array(32).fill(0x22),
    },
    {
      key: new Uint8Array(32).fill(0x33),
      value: new Uint8Array(32).fill(0x44),
    },
  ];
  for (const { key, value } of leaves) {
    await smt.addLeaf(key, value);
  }
  const root = await smt.calculateRoot();
  const target = leaves[0];
  const cert = InclusionCertificate.create(root, target.key);
  return { cert, key: target.key, root: root.hash, value: new DataHash(HashAlgorithm.SHA256, target.value) };
}

Given('binary bytes of length {int}', function (this: TokenWorld, length: number): void {
  const stash = getStash(this);
  stash.bytes = new Uint8Array(length);
  stash.decodeError = undefined;
});

Given(
  'a 64-byte buffer where the bitmap has popcount 2 and only 1 sibling chunk follows',
  function (this: TokenWorld): void {
    // 32-byte bitmap with two bits set (bytes[0]=0x03 → bits 0 and 1 set), then 32 bytes of sibling data
    const bytes = new Uint8Array(64);
    bytes[0] = 0x03;
    getStash(this).bytes = bytes;
  },
);

When('InclusionCertificate.decode is invoked', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.bytes, 'binary bytes were not set');
  try {
    InclusionCertificate.decode(stash.bytes);
  } catch (err) {
    stash.decodeError = err as Error;
  }
});

Then(
  'InclusionCertificate.decode throws with message containing {string}',
  function (this: TokenWorld, fragment: string): void {
    const stash = getStash(this);
    assert.ok(stash.decodeError, 'expected decode to throw, but it did not');
    assert.ok(
      stash.decodeError.message.toLowerCase().includes(fragment.toLowerCase()),
      `expected "${fragment}", got "${stash.decodeError.message}"`,
    );
  },
);

Given('an InclusionCertificate built from the test fixture token', async function (this: TokenWorld): Promise<void> {
  const { cert, root, key, value } = await buildFixtureCertificate();
  const stash = getStash(this);
  stash.cert = cert;
  stash.rootHash = root;
  stash.leafKey = key;
  stash.leafValue = value;
  // Sanity: the freshly built cert must verify
  const ok = await cert.verify(StateId.fromCBOR(CborSerializer.encodeByteString(key)), value, root);
  assert.ok(ok, 'fixture certificate failed self-verification — fixture is broken');
});

When('the InclusionCertificate is encoded then decoded', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.cert, 'no certificate to encode');
  const encoded = stash.cert.encode();
  const decoded = InclusionCertificate.decode(encoded);
  stash.bitmap = encoded.slice(0, 32);
  stash.siblingCount = (encoded.length - 32) / 32;
  stash.cert = decoded;
});

Then('the decoded bitmap equals the original', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.cert && stash.bitmap, 'cert or bitmap missing');
  const reEncoded = stash.cert.encode();
  assert.deepEqual(Array.from(reEncoded.slice(0, 32)), Array.from(stash.bitmap));
});

Then('the decoded sibling count equals the original', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.cert && stash.siblingCount !== undefined, 'cert or count missing');
  const reEncoded = stash.cert.encode();
  assert.equal((reEncoded.length - 32) / 32, stash.siblingCount);
});

When('the first sibling hash is corrupted', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  assert.ok(stash.cert && stash.leafKey && stash.leafValue && stash.rootHash, 'fixture not initialised');
  const encoded = stash.cert.encode();
  // Flip a byte inside the first sibling slot (offset 32 = right after bitmap)
  // — this preserves popcount, so re-decode succeeds; verify must fail.
  encoded[32] ^= 0xff;
  const corrupted = InclusionCertificate.decode(encoded);
  stash.verifyResult = await corrupted.verify(
    StateId.fromCBOR(CborSerializer.encodeByteString(stash.leafKey)),
    stash.leafValue,
    stash.rootHash,
  );
});

Then('verify returns false against the original root and StateID', function (this: TokenWorld): void {
  assert.equal(getStash(this).verifyResult, false);
});

When('verify is called with a root hash differing by one byte', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  assert.ok(stash.cert && stash.leafKey && stash.leafValue && stash.rootHash, 'fixture not initialised');
  const wrongRootBytes = new Uint8Array(stash.rootHash.data);
  wrongRootBytes[0] ^= 0xff;
  const wrongRoot = new DataHash(HashAlgorithm.SHA256, wrongRootBytes);
  stash.verifyResult = await stash.cert.verify(
    StateId.fromCBOR(CborSerializer.encodeByteString(stash.leafKey)),
    stash.leafValue,
    wrongRoot,
  );
});

Then('verify returns false', function (this: TokenWorld): void {
  assert.equal(getStash(this).verifyResult, false);
});
