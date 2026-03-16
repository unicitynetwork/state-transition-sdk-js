import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { PayToPublicKeyPredicate } from '../../../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { PayToScriptHash } from '../../../../src/transaction/PayToScriptHash.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../../../src/util/InclusionProofUtils.js';
import { TokenWorld } from '../support/World.js';

When('Alice submits a valid transfer to Bob', async function (this: TokenWorld): Promise<void> {
  this.firstTransferTransaction = await TransferTransaction.create(
    this.token,
    this.alice.predicate,
    await PayToScriptHash.create(this.bob.predicate),
    crypto.getRandomValues(new Uint8Array(32)),
    CborSerializer.encodeArray(),
  );

  const certificationData = await CertificationData.fromTransferTransaction(
    this.firstTransferTransaction,
    await PayToPublicKeyPredicate.generateUnlockScript(this.firstTransferTransaction, this.alice.signingService),
  );

  this.firstResponse = await this.setup.client.submitCertificationRequest(certificationData);
});

When('Alice submits a second transfer of the same token', async function (this: TokenWorld): Promise<void> {
  this.secondTransferTransaction = await TransferTransaction.create(
    this.token,
    this.alice.predicate,
    await PayToScriptHash.create(this.alice.predicate),
    crypto.getRandomValues(new Uint8Array(32)),
    CborSerializer.encodeArray(),
  );

  const certificationData = await CertificationData.fromTransferTransaction(
    this.secondTransferTransaction,
    await PayToPublicKeyPredicate.generateUnlockScript(this.secondTransferTransaction, this.alice.signingService),
  );

  this.secondResponse = await this.setup.client.submitCertificationRequest(certificationData);
});

Then(/^the first aggregator response is "([^"]+)"$/, function (this: TokenWorld, status: string): void {
  const expected = CertificationStatus[status as keyof typeof CertificationStatus];
  assert.ok(expected !== undefined, `Unknown CertificationStatus: ${status}`);
  assert.strictEqual(this.firstResponse.status, expected);
});

Then(/^the second aggregator response is "([^"]+)"$/, function (this: TokenWorld, status: string): void {
  const expected = CertificationStatus[status as keyof typeof CertificationStatus];
  assert.ok(expected !== undefined, `Unknown CertificationStatus: ${status}`);
  assert.strictEqual(this.secondResponse.status, expected);
});

Then(
  /^the inclusion proof verification rejects the second transfer with "([^"]+)"$/,
  async function (this: TokenWorld, error: string): Promise<void> {
    await assert.rejects(
      () =>
        waitInclusionProof(
          this.setup.trustBase,
          this.setup.predicateVerifier,
          this.setup.client,
          this.secondTransferTransaction,
        ),
      (e: Error) => e.message.includes(`Invalid inclusion proof status: ${error}`),
    );
  },
);
