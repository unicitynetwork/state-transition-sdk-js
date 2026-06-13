import { strict as assert } from 'assert';

import { Then, When } from '@cucumber/cucumber';

import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { SignaturePredicate } from '../../../../src/predicate/builtin/SignaturePredicate.js';
import { Token } from '../../../../src/transaction/Token.js';
import { createUser, mintToken, transferToken } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

When(
  '{int} tokens are minted in a row by the same user',
  { timeout: 600_000 },
  async function (this: TokenWorld, count: number): Promise<void> {
    if (!this.alice) {
      this.alice = createUser();
    }
    this.stressMintedTokens = [];
    for (let i = 0; i < count; i++) {
      this.stressMintedTokens.push(await mintToken(this.setup, this.alice));
    }
  },
);

Then('every minted token passes verification', async function (this: TokenWorld): Promise<void> {
  const tokens = this.stressMintedTokens ?? [];
  assert.ok(tokens.length > 0, 'no minted tokens to verify');
  for (const token of tokens) {
    const result = await token.verify(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      this.setup.mintJustificationVerifier,
    );
    assert.equal(result.status, 'OK', `token ${token.id.toString()} failed verification: ${result.status}`);
  }
});

When(
  'Alice mints a token and transfers it through {int} owners',
  { timeout: 600_000 },
  async function (this: TokenWorld, hops: number): Promise<void> {
    this.alice = createUser();
    let owner = this.alice;
    let token: Token = await mintToken(this.setup, this.alice);
    for (let i = 0; i < hops; i++) {
      const next = createUser();
      const ownerPredicate = SignaturePredicate.fromSigningService(owner.signingService);
      const recipientPredicate = SignaturePredicate.fromSigningService(next.signingService);
      token = await transferToken(this.setup, token, ownerPredicate, owner.signingService, recipientPredicate);
      owner = next;
    }
    this.token = token;
    this.finalToken = token;
  },
);

Then('the final token has {int} transactions in its history', function (this: TokenWorld, expected: number): void {
  assert.equal(this.finalToken.transactions.length, expected);
});

When('the same certification data is re-submitted', async function (this: TokenWorld): Promise<void> {
  const certData = this.token.genesis.inclusionProof.certificationData;
  if (!certData) {
    throw new Error('no certData on genesis');
  }
  const response = await this.setup.client.submitCertificationRequest(certData);
  this.dupResponseStatus = response.status;
});

Then("the re-submission's status is {string}", function (this: TokenWorld, expected: string): void {
  const expectedStatus = CertificationStatus[expected as keyof typeof CertificationStatus];
  assert.equal(this.dupResponseStatus, expectedStatus);
});
