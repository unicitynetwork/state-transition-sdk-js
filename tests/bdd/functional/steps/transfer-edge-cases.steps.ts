import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { SignaturePredicateUnlockScript } from '../../../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../../../src/util/InclusionProofUtils.js';
import { transferToken } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

When('Alice transfers the token to herself', async function (this: TokenWorld): Promise<void> {
  this.transferredToken = await transferToken(
    this.setup,
    this.token,
    this.alice.predicate,
    this.alice.signingService,
    this.alice.predicate,
  );
});

When('Alice tries to submit a transfer of the stale token to Bob', async function (this: TokenWorld): Promise<void> {
  this.transferTransaction = await TransferTransaction.create(
    this.token,
    this.bob.predicate,
    crypto.getRandomValues(new Uint8Array(32)),
  );

  const certificationData = await CertificationData.fromTransaction(
    this.transferTransaction,
    await SignaturePredicateUnlockScript.create(this.transferTransaction, this.alice.signingService),
  );

  const response = await this.setup.client.submitCertificationRequest(certificationData);
  this.certificationStatus = response.status;
});

Then(
  /^the stale transfer inclusion proof rejects with "([^"]+)"$/,
  async function (this: TokenWorld, error: string): Promise<void> {
    assert.ok(this.transferTransaction !== null);
    await assert.rejects(
      () =>
        waitInclusionProof(
          this.setup.client,
          this.setup.trustBase,
          this.setup.predicateVerifier,
          this.transferTransaction!,
        ),
      (e: Error) => e.message.includes(`Invalid inclusion proof status: ${error}`),
    );
  },
);

// aggregator-go#151 (sdk-js#118) + sdk-js#119: a re-spend is accepted at submit (SUCCESS) and
// rejected at proof time as TRANSACTION_HASH_MISMATCH. STATE_ID_EXISTS was removed from
// CertificationStatus in #119; the proof-time check is the only enforcement layer the SDK
// surfaces now.
Then('the stale-token re-spend is rejected as a double-spend', async function (this: TokenWorld): Promise<void> {
  assert.strictEqual(
    this.certificationStatus,
    CertificationStatus.SUCCESS,
    `re-spend submit status should be SUCCESS, got ${String(this.certificationStatus)}`,
  );
  assert.ok(this.transferTransaction !== null);
  await assert.rejects(
    () =>
      waitInclusionProof(
        this.setup.client,
        this.setup.trustBase,
        this.setup.predicateVerifier,
        this.transferTransaction!,
      ),
    (e: Error) => e.message.includes('TRANSACTION_HASH_MISMATCH'),
  );
});
