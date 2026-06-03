import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { SignaturePredicateUnlockScript } from '../../../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
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
      await SignaturePredicateUnlockScript.create(tx, user.signingService),
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
      await SignaturePredicateUnlockScript.create(this.transferTransaction, user.signingService),
    );

    try {
      const response = await this.tree.setup.client.submitCertificationRequest(certData);
      this.certificationStatusTree = response.status;
    } catch (error) {
      // PR #119+: the aggregator may surface a re-spend rejection as a JSON-RPC error / a
      // response shape that doesn't parse as CertificationResponse. Treat any submit-side
      // throw as the rejection signal; the Then step accepts that path explicitly.
      this.certificationStatusTree = null;
      this.respendSubmitError = error instanceof Error ? error : new Error(String(error));
    }
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

// aggregator-go#151 (sdk-js#118) + sdk-js#119: a re-spend is rejected EITHER at submit (the
// aggregator surfaces a JSON-RPC error; the submit throws) OR accepted at submit (SUCCESS)
// and rejected at proof time as TRANSACTION_HASH_MISMATCH. STATE_ID_EXISTS was removed from
// CertificationStatus in #119; the proof-time check is the SDK's only enforcement layer when
// the aggregator accepts the submit.
Then('the duplicate transfer is rejected as a double-spend', async function (this: TokenWorld): Promise<void> {
  if (this.certificationStatusTree === null) {
    assert.ok(this.respendSubmitError, 'submit was reported as failed but no error was captured');
    return;
  }
  assert.strictEqual(
    this.certificationStatusTree,
    CertificationStatus.SUCCESS,
    `re-spend submit status should be SUCCESS, got ${String(this.certificationStatusTree)}`,
  );
  assert.ok(this.transferTransaction !== null);
  await assert.rejects(
    () =>
      waitInclusionProof(
        this.tree.setup.client,
        this.tree.setup.trustBase,
        this.tree.setup.predicateVerifier,
        this.transferTransaction!,
      ),
    (e: Error) => e.message.includes('TRANSACTION_HASH_MISMATCH'),
  );
});
