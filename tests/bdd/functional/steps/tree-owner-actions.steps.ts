import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { PayToPublicKeyPredicateUnlockScript } from '../../../../src/predicate/builtin/PayToPublicKeyPredicateUnlockScript.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../../../src/util/InclusionProofUtils.js';
import { createUser } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

When(
  /^(\w+) creates a transfer for "(.+)"$/,
  async function (this: TokenWorld, userName: string, tokenName: string): Promise<void> {
    const user = this.tree.usersByName.get(userName)!;
    const token = this.tree.tokensByName.get(tokenName)!;
    assert.ok(user !== undefined);
    assert.ok(token !== undefined);
    const recipient = createUser();
    this.transferError = null;

    try {
      await TransferTransaction.create(token, recipient.predicate, crypto.getRandomValues(new Uint8Array(32)));
    } catch (e) {
      this.transferError = e as Error;
    }
  },
);

Then('the transfer creation succeeds', function (this: TokenWorld): void {
  assert.strictEqual(this.transferError, null);
});

When(
  /^(\w+) transfers "(.+)" to (\w+)$/,
  async function (this: TokenWorld, userName: string, tokenName: string, recipientName: string): Promise<void> {
    const user = this.tree.usersByName.get(userName)!;
    const token = this.tree.tokensByName.get(tokenName)!;
    const recipient = this.tree.usersByName.get(recipientName)!;
    assert.ok(user !== undefined);
    assert.ok(token !== undefined);
    assert.ok(recipient !== undefined);

    const tx = await TransferTransaction.create(token, recipient.predicate, crypto.getRandomValues(new Uint8Array(32)));

    const certData = await CertificationData.fromTransaction(
      tx,
      await PayToPublicKeyPredicateUnlockScript.create(tx, user.signingService),
    );

    const response = await this.tree.setup.client.submitCertificationRequest(certData);
    assert.strictEqual(response.status, CertificationStatus.SUCCESS);

    this.transferredToken = await token.transfer(
      this.tree.setup.trustBase,
      this.tree.setup.predicateVerifier,
      await tx.toCertifiedTransaction(
        this.tree.setup.trustBase,
        this.tree.setup.predicateVerifier,
        await waitInclusionProof(
          this.tree.setup.client,
          this.tree.setup.trustBase,
          this.tree.setup.predicateVerifier,
          tx,
        ),
      ),
    );
  },
);

When(
  /^(\w+) submits a duplicate transfer for pre-transfer token "(.+)"$/,
  async function (this: TokenWorld, userName: string, tokenName: string): Promise<void> {
    const user = this.tree.usersByName.get(userName)!;
    const token = this.tree.tokensByName.get(tokenName)!;
    assert.ok(user !== undefined);
    assert.ok(token !== undefined);
    const recipient = createUser();

    this.transferTransaction = await TransferTransaction.create(
      token,
      recipient.predicate,
      crypto.getRandomValues(new Uint8Array(32)),
    );

    const certData = await CertificationData.fromTransaction(
      this.transferTransaction,
      await PayToPublicKeyPredicateUnlockScript.create(this.transferTransaction, user.signingService),
    );

    const response = await this.tree.setup.client.submitCertificationRequest(certData);
    this.certificationStatusTree = response.status;
  },
);

Then(/^the aggregator responds with "([^"]+)"$/, function (this: TokenWorld, status: string): void {
  const expected = CertificationStatus[status as keyof typeof CertificationStatus];
  assert.ok(expected !== undefined, `Unknown CertificationStatus: ${status}`);
  assert.strictEqual(this.certificationStatusTree, expected);
});

Then(/^the inclusion proof rejects with "([^"]+)"$/, async function (this: TokenWorld, error: string): Promise<void> {
  assert.ok(this.transferTransaction !== null);
  await assert.rejects(
    () =>
      waitInclusionProof(
        this.tree.setup.client,
        this.tree.setup.trustBase,
        this.tree.setup.predicateVerifier,
        this.transferTransaction!,
      ),
    (e: Error) => e.message.includes(error),
  );
});
