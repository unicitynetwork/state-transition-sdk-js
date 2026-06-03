import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import {
  buildCanonicalCertificationRequest,
  submitRawCertificationRequest,
} from '../support/RawCertificationSubmitter.js';
import { createUser } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

// Canonical certification_request layout (CertificationRequest.toCBOR):
//   D9 9876   tag 39030
//   84        array(4)
//   01        element 0: version (uint 1)
//   <stateId> element 1
//   <certData> element 2
//   00        element 3: uint 0  (the final byte)
function assertCanonicalShape(b: Uint8Array): void {
  assert.ok(b.length > 6 && b[0] === 0xd9 && b[1] === 0x98 && b[2] === 0x76, 'unexpected certification_request tag');
  assert.strictEqual(b[3], 0x84, 'expected definite array(4) header at offset 3');
  assert.strictEqual(b[4], 0x01, 'expected version byte 0x01 at offset 4');
  assert.strictEqual(b[b.length - 1], 0x00, 'expected trailing uint 0 as the final byte');
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// Derive a specific non-canonical form from a canonical request, keeping the request shape so
// the aggregator's canonical validator (not its structural validator) is what fires.
function mutate(canonical: Uint8Array, kind: string): Uint8Array {
  assertCanonicalShape(canonical);
  const last = canonical.length - 1;
  switch (kind) {
    // version uint 1 (0x01 @4) re-encoded in 4 bytes → non-shortest argument encoding (value).
    case 'non-minimal integer':
      return concatBytes(canonical.slice(0, 4), new Uint8Array([0x1a, 0x00, 0x00, 0x00, 0x01]), canonical.slice(5));
    // outer array(4) header (0x84 @3) re-encoded as `98 04` (count in a trailing byte) →
    // non-shortest argument encoding on a LENGTH argument (vs the value field above).
    case 'non-minimal length':
      return concatBytes(canonical.slice(0, 3), new Uint8Array([0x98, 0x04]), canonical.slice(4));
    // definite array(4) header (0x84 @3) → indefinite array (0x9f), closed with a break (0xff).
    case 'indefinite-length':
      return concatBytes(canonical.slice(0, 3), new Uint8Array([0x9f]), canonical.slice(4), new Uint8Array([0xff]));
    // one extra byte after the complete top-level value.
    case 'trailing bytes':
      return concatBytes(canonical, new Uint8Array([0xf6]));
    // replace the final element (uint 0) with a half-precision float 0.0 (F9 0000).
    case 'float':
      return concatBytes(canonical.slice(0, last), new Uint8Array([0xf9, 0x00, 0x00]));
    // replace the final element (uint 0) with a 2-key map whose keys (1, 0) are out of
    // canonical order: A2 01 F6 00 F6 = {1: null, 0: null}.
    case 'unsorted map keys':
      return concatBytes(canonical.slice(0, last), new Uint8Array([0xa2, 0x01, 0xf6, 0x00, 0xf6]));
    default:
      throw new Error(`Unknown mutation: ${kind}`);
  }
}

function getStash(world: TokenWorld): NonNullable<TokenWorld['canonicalCborStash']> {
  if (!world.canonicalCborStash) {
    throw new Error('canonicalCborStash not initialised — run the Background first');
  }
  return world.canonicalCborStash;
}

Given('a fresh canonical certification_request is built', async function (this: TokenWorld): Promise<void> {
  const recipient = createUser().predicate;
  const mintTransaction = await MintTransaction.create(this.setup.trustBase.networkId, recipient);
  const certData = await CertificationData.fromMintTransaction(mintTransaction);
  const { bytes, stateId } = await buildCanonicalCertificationRequest(certData);
  this.canonicalCborStash = { bytes, stateId };
});

When('the canonical certification_request is submitted raw', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  stash.submitResponse = await submitRawCertificationRequest(stash.bytes, stash.stateId);
});

When(
  'the certification_request is mutated to {string} and submitted raw',
  async function (this: TokenWorld, kind: string): Promise<void> {
    const stash = getStash(this);
    const mutated = mutate(stash.bytes, kind);
    try {
      stash.submitResponse = await submitRawCertificationRequest(mutated, stash.stateId);
    } catch (error) {
      stash.submitError = error instanceof Error ? error : new Error(String(error));
    }
  },
);

Then('the raw submission is accepted', function (this: TokenWorld): void {
  const stash = getStash(this);
  const response = stash.submitResponse;
  assert.ok(
    response,
    `expected the canonical request to be accepted, but submit threw: ${String(stash.submitError?.message)}`,
  );
  assert.strictEqual(response.status, CertificationStatus.SUCCESS);
});

Then(
  'the raw submission is rejected as non-canonical because of {string}',
  function (this: TokenWorld, reason: string): void {
    const stash = getStash(this);
    const error = stash.submitError;
    assert.ok(
      error,
      `expected a non-canonical rejection, but submit succeeded with status ${String(stash.submitResponse?.status)}`,
    );
    assert.ok(
      error.message.includes('CBOR is not canonical'),
      `expected "CBOR is not canonical" in the rejection, got: ${error.message}`,
    );
    assert.ok(error.message.includes(reason), `expected reason "${reason}" in the rejection, got: ${error.message}`);
  },
);

Then('the mutated request is not certified', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  try {
    const response = await this.setup.aggregatorClient.getInclusionProof(stash.stateId);
    // A returned proof for the rejected request must carry no certification data (non-inclusion).
    assert.strictEqual(
      response.inclusionProof.certificationData,
      null,
      'a rejected non-canonical request must not have been certified',
    );
  } catch (error) {
    // A path-invalid / not-found proof error also proves non-inclusion. A transport failure,
    // however, must NOT be mistaken for "not certified" — surface it instead of swallowing it.
    const message = error instanceof Error ? error.message : String(error);
    if (/fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|UND_ERR/.test(message)) {
      throw error;
    }
  }
});
