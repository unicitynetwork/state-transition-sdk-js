import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { PayToPublicKeyPredicate } from '../../../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { PayToScriptHash } from '../../../../src/transaction/PayToScriptHash.js';
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
    this.alice.predicate,
    await PayToScriptHash.create(this.bob.predicate),
    crypto.getRandomValues(new Uint8Array(32)),
    CborSerializer.encodeArray(),
  );

  const certificationData = await CertificationData.fromTransferTransaction(
    this.transferTransaction,
    await PayToPublicKeyPredicate.generateUnlockScript(this.transferTransaction, this.alice.signingService),
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
          this.setup.trustBase,
          this.setup.predicateVerifier,
          this.setup.client,
          this.transferTransaction,
        ),
      (e: Error) => e.message.includes(`Invalid inclusion proof status: ${error}`),
    );
  },
);
