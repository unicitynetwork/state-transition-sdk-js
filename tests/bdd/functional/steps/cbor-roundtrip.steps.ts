import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { InclusionProof } from '../../../../src/api/InclusionProof.js';
import { TokenWorld } from '../support/World.js';

When('the transferred token is exported to CBOR', function (this: TokenWorld): void {
  assert.ok(this.transferredToken !== null);
  this.cborData = this.transferredToken.toCBOR();
});

When('the first split token is exported to CBOR', function (this: TokenWorld): void {
  this.cborData = this.splitTokens[0].toCBOR();
});

Then(
  /^the imported token has (\d+) transactions? in its history$/,
  function (this: TokenWorld, expectedCount: string): void {
    assert.strictEqual(this.importedToken.transactions.length, parseInt(expectedCount, 10));
  },
);

When("the token's inclusion proof is encoded then decoded then re-encoded", function (this: TokenWorld): void {
  const proof = this.token.genesis.inclusionProof;
  const first = proof.toCBOR();
  const second = InclusionProof.fromCBOR(first).toCBOR();
  this.cborRoundtripFirst = first;
  this.cborRoundtripSecond = second;
});

When("the token's certification data is encoded then decoded then re-encoded", function (this: TokenWorld): void {
  const certData = this.token.genesis.inclusionProof.certificationData;
  if (!certData) {
    throw new Error('genesis proof has no certificationData');
  }
  const first = certData.toCBOR();
  const second = CertificationData.fromCBOR(first).toCBOR();
  this.cborRoundtripFirst = first;
  this.cborRoundtripSecond = second;
});

Then('the second encoding equals the first byte-for-byte', function (this: TokenWorld): void {
  assert.ok(this.cborRoundtripFirst && this.cborRoundtripSecond, 'roundtrip buffers not set');
  assert.deepEqual(
    Array.from(this.cborRoundtripSecond),
    Array.from(this.cborRoundtripFirst),
    'CBOR re-encoding produced different bytes',
  );
});
