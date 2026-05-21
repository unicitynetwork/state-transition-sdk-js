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

// aggregator-go#151 (sdk-js#118): the spent state cannot be re-spent — rejected either at
// submit (STATE_ID_EXISTS, finalized-dup lookup) or at proof time (TRANSACTION_HASH_MISMATCH,
// skip-finalized-dup-lookup async-v2 path). Accept either; both block the double-spend.
Then('the stale-token re-spend is rejected as a double-spend', async function (this: TokenWorld): Promise<void> {
  if (this.certificationStatus === CertificationStatus.STATE_ID_EXISTS) {
    return;
  }
  assert.strictEqual(
    this.certificationStatus,
    CertificationStatus.SUCCESS,
    `re-spend submit status should be STATE_ID_EXISTS or SUCCESS, got ${String(this.certificationStatus)}`,
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
