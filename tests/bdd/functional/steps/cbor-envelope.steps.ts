import { strict as assert } from 'assert';

import { Given, Then, When } from '@cucumber/cucumber';

import { InputRecord } from '../../../../src/api/bft/InputRecord.js';
import { ShardTreeCertificate } from '../../../../src/api/bft/ShardTreeCertificate.js';
import { UnicityCertificate } from '../../../../src/api/bft/UnicityCertificate.js';
import { CertificationData } from '../../../../src/api/CertificationData.js';
import { InclusionProof } from '../../../../src/api/InclusionProof.js';
import { SplitMintJustification } from '../../../../src/payment/SplitMintJustification.js';
import { EncodedPredicate } from '../../../../src/predicate/EncodedPredicate.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { UnicityIdMintTransaction } from '../../../../src/unicity-id/UnicityIdMintTransaction.js';
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
  SplitMintJustification: SplitMintJustification.fromCBOR.bind(SplitMintJustification),
  UnicityCertificate: UnicityCertificate.fromCBOR.bind(UnicityCertificate),
  UnicityIdMintTransaction: UnicityIdMintTransaction.fromCBOR.bind(UnicityIdMintTransaction),
};
// Note: TransferTransaction.fromCBOR(bytes, token) needs a Token arg, so it doesn't fit this
// generic envelope harness. It's tested in its own roundtrip feature.

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

// PR #110 fdcf6ab — CertificationData canonicalization round-trip stash
interface ICanonicalStash {
  encoded: Uint8Array;
  reEncoded?: Uint8Array;
}

function getCanonicalStash(world: TokenWorld): ICanonicalStash {
  if (!world.canonicalCertDataStash) {
    world.canonicalCertDataStash = { encoded: new Uint8Array() };
  }
  return world.canonicalCertDataStash;
}

Given('a CertificationData is built from a sample MintTransaction', async function (this: TokenWorld): Promise<void> {
  const { CertificationData } = await import('../../../../src/api/CertificationData.js');
  const { MintTransaction } = await import('../../../../src/transaction/MintTransaction.js');
  const { TokenId } = await import('../../../../src/transaction/TokenId.js');
  const { TokenType } = await import('../../../../src/transaction/TokenType.js');
  const { SignaturePredicate } = await import('../../../../src/predicate/builtin/SignaturePredicate.js');
  const { HexConverter } = await import('../../../../src/util/HexConverter.js');

  const recipient = SignaturePredicate.create(
    HexConverter.decode('02ce9f22e51333c97a8fb1f807a229ece3a8765a16af5fc1a13e30834be3280026'),
  );
  const mintTx = await MintTransaction.create(
    recipient,
    new TokenId(new Uint8Array(32)),
    new TokenType(new Uint8Array(32)),
  );
  const certData = await CertificationData.fromMintTransaction(mintTx);
  getCanonicalStash(this).encoded = certData.toCBOR();
});

When('the CertificationData is encoded, decoded, and re-encoded', async function (this: TokenWorld): Promise<void> {
  const { CertificationData } = await import('../../../../src/api/CertificationData.js');
  const stash = getCanonicalStash(this);
  const decoded = CertificationData.fromCBOR(stash.encoded);
  stash.reEncoded = decoded.toCBOR();
});

Then('the original and re-encoded CBOR bytes are byte-identical', function (this: TokenWorld): void {
  const stash = getCanonicalStash(this);
  assert.ok(stash.reEncoded, 'reEncoded missing — When step skipped?');
  assert.equal(
    Buffer.from(stash.encoded).toString('hex'),
    Buffer.from(stash.reEncoded).toString('hex'),
    'canonicalization should make round-trip CBOR byte-identical',
  );
});
