import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { Address } from '../../../../src/transaction/Address.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { Token } from '../../../../src/transaction/Token.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { waitInclusionProof } from '../../../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { createUser } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

Given('a user with a signing key', function (this: TokenWorld): void {
  this.user = createUser();
});

When('the user mints a new token', async function (this: TokenWorld): Promise<void> {
  const mintTransaction = await MintTransaction.create(
    await Address.fromPredicate(this.user.predicate),
    new TokenId(crypto.getRandomValues(new Uint8Array(32))),
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    CborSerializer.encodeArray(),
  );

  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
  const response = await this.setup.client.submitCertificationRequest(certificationData);
  this.certificationStatus = response.status;

  this.token = await Token.mint(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    await mintTransaction.toCertifiedTransaction(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      await waitInclusionProof(this.setup.client, this.setup.trustBase, this.setup.predicateVerifier, mintTransaction),
    ),
  );
});

When('the user mints a new token with specific token ID and type', async function (this: TokenWorld): Promise<void> {
  this.mintTokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  this.mintTokenType = new TokenType(crypto.getRandomValues(new Uint8Array(32)));

  const mintTransaction = await MintTransaction.create(
    await Address.fromPredicate(this.user.predicate),
    this.mintTokenId,
    this.mintTokenType,
    CborSerializer.encodeArray(),
  );

  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
  await this.setup.client.submitCertificationRequest(certificationData);

  this.token = await Token.mint(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    await mintTransaction.toCertifiedTransaction(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      await waitInclusionProof(this.setup.client, this.setup.trustBase, this.setup.predicateVerifier, mintTransaction),
    ),
  );
});

Then(/^the certification response status is "([^"]+)"$/, function (this: TokenWorld, status: string): void {
  const expected = CertificationStatus[status as keyof typeof CertificationStatus];
  assert.ok(expected !== undefined, `Unknown CertificationStatus: ${status}`);
  assert.strictEqual(this.certificationStatus, expected);
});

Then('the token ID matches the mint parameters', function (this: TokenWorld): void {
  assert.deepStrictEqual(this.token.id.bytes, this.mintTokenId.bytes);
});

Then('the token type matches the mint parameters', function (this: TokenWorld): void {
  assert.deepStrictEqual(this.token.type.bytes, this.mintTokenType.bytes);
});

Then('the token passes verification', async function (this: TokenWorld): Promise<void> {
  const result = await this.token.verify(this.setup.trustBase, this.setup.predicateVerifier);
  assert.strictEqual(result.status, VerificationStatus.OK);
});
