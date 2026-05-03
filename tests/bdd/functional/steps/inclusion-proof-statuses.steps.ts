import { strict as assert } from 'assert';

import { Then, When } from '@cucumber/cucumber';

import { ShardId } from '../../../../src/api/bft/ShardId.js';
import { ShardTreeCertificate } from '../../../../src/api/bft/ShardTreeCertificate.js';
import { UnicityCertificate } from '../../../../src/api/bft/UnicityCertificate.js';
import { CertificationData } from '../../../../src/api/CertificationData.js';
import { InclusionCertificate } from '../../../../src/api/InclusionCertificate.js';
import { InclusionProof } from '../../../../src/api/InclusionProof.js';
import { EncodedPredicate } from '../../../../src/predicate/EncodedPredicate.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { InclusionProofVerificationRule } from '../../../../src/transaction/verification/rule/InclusionProofVerificationRule.js';
import { TokenWorld } from '../support/World.js';

interface IStatusStash {
  mutatedProof?: InclusionProof;
}

function getStash(world: TokenWorld): IStatusStash {
  if (!world.statusStash) {
    world.statusStash = {};
  }
  return world.statusStash;
}

function getOriginalProof(world: TokenWorld): InclusionProof {
  const proof = world.token?.genesis?.inclusionProof;
  if (!proof) {
    throw new Error('No inclusion proof on token.genesis — Background must mint first');
  }
  return proof;
}

function flipFirstSibling(certBytes: Uint8Array): Uint8Array {
  if (certBytes.length <= 32) {
    throw new Error('cannot flip a sibling: cert has no siblings');
  }
  const copy = new Uint8Array(certBytes);
  copy[32] ^= 0xff;
  return copy;
}

function rebuildWithFlippedSibling(original: InclusionProof): InclusionProof {
  if (!original.inclusionCertificate) {
    throw new Error('original proof has no inclusionCertificate to corrupt');
  }
  const corrupted = InclusionCertificate.decode(flipFirstSibling(original.inclusionCertificate.encode()));
  return new InclusionProof(original.certificationData, corrupted, original.unicityCertificate);
}

function replaceShardWithMismatch(original: InclusionProof, stateIdFirstByte: number): InclusionProof {
  // Build a 1-bit ShardId whose first bit differs from the StateID's first bit.
  const stateIdMsb = (stateIdFirstByte >> 7) & 1;
  const flippedBit = stateIdMsb === 0 ? 1 : 0;
  // Encoded form: 1 byte where the high bit is the flipped bit, second-highest is the trailing-1 marker.
  const encoded = new Uint8Array([flippedBit === 1 ? 0xc0 : 0x40]);
  const mismatchingShard = ShardId.decode(encoded);
  const originalUC = original.unicityCertificate;
  const originalCert = originalUC.shardTreeCertificate;
  const replacedCert = new ShardTreeCertificate(mismatchingShard, originalCert.siblingHashList);
  const replacedUC = new UnicityCertificate(
    originalUC.inputRecord,
    originalUC.technicalRecordHash,
    originalUC.shardConfigurationHash,
    replacedCert,
    originalUC.unicityTreeCertificate,
    originalUC.unicitySeal,
  );
  return new InclusionProof(original.certificationData, original.inclusionCertificate, replacedUC);
}

function corruptTxhash(original: InclusionProof): InclusionProof {
  const certData = original.certificationData;
  if (!certData) {
    throw new Error('cannot corrupt txhash on a proof without certData');
  }
  // CertificationData has a private constructor; rebuild via CBOR with a corrupted transactionHash.
  const garbageHash = new Uint8Array(32).fill(0xab);
  const corruptedBytes = CborSerializer.encodeTag(
    CertificationData.CBOR_TAG,
    CborSerializer.encodeArray(
      CborSerializer.encodeUnsignedInteger(1n),
      EncodedPredicate.fromPredicate(certData.lockScript).toCBOR(),
      CborSerializer.encodeByteString(certData.sourceStateHash.data),
      CborSerializer.encodeByteString(garbageHash),
      CborSerializer.encodeByteString(certData.unlockScript),
    ),
  );
  const corrupted = CertificationData.fromCBOR(corruptedBytes);
  return new InclusionProof(corrupted, original.inclusionCertificate, original.unicityCertificate);
}

When('the inclusion proof has its inclusionCertificate removed', function (this: TokenWorld): void {
  const original = getOriginalProof(this);
  getStash(this).mutatedProof = new InclusionProof(original.certificationData, null, original.unicityCertificate);
});

When('the inclusion proof has its certificationData removed', function (this: TokenWorld): void {
  const original = getOriginalProof(this);
  getStash(this).mutatedProof = new InclusionProof(null, original.inclusionCertificate, original.unicityCertificate);
});

When("the inclusion proof's first sibling hash is corrupted", function (this: TokenWorld): void {
  const original = getOriginalProof(this);
  getStash(this).mutatedProof = rebuildWithFlippedSibling(original);
});

When(
  "the UC's shardTreeCertificate is replaced with a non-matching prefix",
  async function (this: TokenWorld): Promise<void> {
    const original = getOriginalProof(this);
    const txn = this.token.genesis;
    const { StateId } = await import('../../../../src/api/StateId.js');
    const stateId = await StateId.fromTransaction(txn);
    getStash(this).mutatedProof = replaceShardWithMismatch(original, stateId.data[0]);
  },
);

When("the inclusion proof's transactionHash is replaced with garbage", function (this: TokenWorld): void {
  const original = getOriginalProof(this);
  getStash(this).mutatedProof = corruptTxhash(original);
});

When("the inclusion proof's first sibling hash is corrupted on top", function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.mutatedProof, 'must mutate txhash before corrupting siblings on top');
  stash.mutatedProof = rebuildWithFlippedSibling(stash.mutatedProof);
});

When('the inclusion proof is mutated by {string}', function (this: TokenWorld, mutation: string): void {
  const original = getOriginalProof(this);
  const stash = getStash(this);
  switch (mutation) {
    case 'drop-inclusion-certificate':
      stash.mutatedProof = new InclusionProof(original.certificationData, null, original.unicityCertificate);
      break;
    case 'drop-certification-data':
      stash.mutatedProof = new InclusionProof(null, original.inclusionCertificate, original.unicityCertificate);
      break;
    case 'corrupt-sibling':
      stash.mutatedProof = rebuildWithFlippedSibling(original);
      break;
    case 'corrupt-txhash':
      stash.mutatedProof = corruptTxhash(original);
      break;
    default:
      throw new Error(`unknown mutation ${mutation}`);
  }
});

Then(
  'verification of the modified proof returns {string}',
  async function (this: TokenWorld, expected: string): Promise<void> {
    const stash = getStash(this);
    assert.ok(stash.mutatedProof, 'no mutated proof to verify');
    const result = await InclusionProofVerificationRule.verify(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      stash.mutatedProof,
      this.token.genesis,
    );
    assert.equal(
      result.status,
      expected,
      `expected ${expected}, got ${result.status} (nested: ${result.results.map((r) => r.toString()).join(' | ')})`,
    );
    // Reset for next scenario
    stash.mutatedProof = undefined;
  },
);
