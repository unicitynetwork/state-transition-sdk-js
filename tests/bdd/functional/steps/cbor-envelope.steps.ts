import { strict as assert } from 'assert';

import { Given, Then, When } from '@cucumber/cucumber';

import { InputRecord } from '../../../../src/api/bft/InputRecord.js';
import { ShardTreeCertificate } from '../../../../src/api/bft/ShardTreeCertificate.js';
import { CertificationData } from '../../../../src/api/CertificationData.js';
import { InclusionProof } from '../../../../src/api/InclusionProof.js';
import { EncodedPredicate } from '../../../../src/predicate/EncodedPredicate.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenWorld } from '../support/World.js';

interface ICborStash {
  bytes: Uint8Array;
  thrownError?: Error;
}

type DecoderFn = (bytes: Uint8Array) => unknown;

const DECODERS: Record<string, DecoderFn> = {
  CertificationData: CertificationData.fromCBOR.bind(CertificationData),
  EncodedPredicate: EncodedPredicate.fromCBOR.bind(EncodedPredicate),
  InclusionProof: InclusionProof.fromCBOR.bind(InclusionProof),
  InputRecord: InputRecord.fromCBOR.bind(InputRecord),
  MintTransaction: MintTransaction.fromCBOR.bind(MintTransaction),
  ShardTreeCertificate: ShardTreeCertificate.fromCBOR.bind(ShardTreeCertificate),
};

function getStash(world: TokenWorld): ICborStash {
  if (!world.cborEnvelopeStash) {
    world.cborEnvelopeStash = { bytes: new Uint8Array() };
  }
  return world.cborEnvelopeStash;
}

function buildPayload(tag: number, arity: number, version: number): Uint8Array {
  const elements: Uint8Array[] = [];
  if (arity > 0) {
    elements.push(CborSerializer.encodeUnsignedInteger(version));
  }
  for (let i = 1; i < arity; i++) {
    elements.push(CborSerializer.encodeByteString(new Uint8Array(0)));
  }
  return CborSerializer.encodeTag(tag, CborSerializer.encodeArray(...elements));
}

Given(
  'a tagged CBOR payload using tag {int} with arity {int} and version {int}',
  function (this: TokenWorld, tag: number, arity: number, version: number): void {
    getStash(this).bytes = buildPayload(tag, arity, version);
  },
);

When('fromCBOR is invoked on type {string}', async function (this: TokenWorld, typeName: string): Promise<void> {
  const stash = getStash(this);
  const decoder = DECODERS[typeName];
  if (!decoder) {
    throw new Error(`No decoder registered for type ${typeName}`);
  }
  try {
    await decoder(stash.bytes);
  } catch (err) {
    stash.thrownError = err as Error;
  }
});

Then('a CborError is thrown with message containing {string}', function (this: TokenWorld, fragment: string): void {
  const stash = getStash(this);
  assert.ok(stash.thrownError, 'expected an error, but none was thrown');
  assert.ok(
    stash.thrownError.message.toLowerCase().includes(fragment.toLowerCase()),
    `expected message to contain "${fragment}", got "${stash.thrownError.message}"`,
  );
});

Then('no CborError is thrown', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.equal(stash.thrownError, undefined, `unexpected error: ${stash.thrownError?.message}`);
});
