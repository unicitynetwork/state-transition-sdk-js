import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { Asset } from '../../../../src/payment/asset/Asset.js';
import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { SplitMintJustification } from '../../../../src/payment/SplitMintJustification.js';
import { TokenSplit } from '../../../../src/payment/TokenSplit.js';
import { SignaturePredicateUnlockScript } from '../../../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { parseSimplePaymentData, splitToken } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

When('Alice splits the token into 1 output that consumes all assets', async function (this: TokenWorld): Promise<void> {
  const splitTokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const splitAssets: [TokenId, PaymentAssetCollection][] = [
    [splitTokenId, PaymentAssetCollection.create(new Asset(this.assetId1, 100n), new Asset(this.assetId2, 200n))],
  ];

  const result = await splitToken(
    this.setup,
    this.token,
    this.alice.predicate,
    this.alice.signingService,
    splitAssets,
    parseSimplePaymentData,
  );
  this.burnedToken = result.burnedToken;
  this.splitTokens = result.splitTokens;
});

When(
  'Alice splits the token into 2 outputs and remembers the first cert request',
  async function (this: TokenWorld): Promise<void> {
    const splitTokenId1 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
    const splitTokenId2 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
    const splitAssets: [TokenId, PaymentAssetCollection][] = [
      [splitTokenId1, PaymentAssetCollection.create(new Asset(this.assetId1, 60n), new Asset(this.assetId2, 120n))],
      [splitTokenId2, PaymentAssetCollection.create(new Asset(this.assetId1, 40n), new Asset(this.assetId2, 80n))],
    ];

    const splitResult = await TokenSplit.split(this.token, parseSimplePaymentData, splitAssets);

    // Submit burn first.
    const burnUnlock = await SignaturePredicateUnlockScript.create(
      splitResult.burn.transaction,
      this.alice.signingService,
    );
    const burnCertData = await CertificationData.fromTransaction(splitResult.burn.transaction, burnUnlock);
    const burnResp = await this.setup.client.submitCertificationRequest(burnCertData);
    if (burnResp.status !== CertificationStatus.SUCCESS) {
      throw new Error(`burn failed: ${burnResp.status}`);
    }

    // Build the split-mint cert request for the FIRST split token; we will submit it twice.
    const proofEntry = splitResult.proofs.get(splitTokenId1);
    if (!proofEntry) {
      throw new Error('proof missing');
    }
    // Bind a fresh user as the split recipient — irrelevant for the idempotency test.
    const splitRecipient = (await import('../support/TestSetup.js')).createUser();

    const justification = SplitMintJustification.create(
      await this.token.transfer(
        this.setup.trustBase,
        this.setup.predicateVerifier,
        await splitResult.burn.transaction.toCertifiedTransaction(
          this.setup.trustBase,
          this.setup.predicateVerifier,
          await (
            await import('../../../../src/util/InclusionProofUtils.js')
          ).waitInclusionProof(
            this.setup.client,
            this.setup.trustBase,
            this.setup.predicateVerifier,
            splitResult.burn.transaction,
          ),
        ),
      ),
      proofEntry.proofs,
    );

    const mintTx = await MintTransaction.create(
      splitRecipient.predicate,
      splitTokenId1,
      this.token.type,
      justification.toCBOR(),
      splitAssets[0][1].toCBOR(),
    );
    const mintCertData = await CertificationData.fromMintTransaction(mintTx);

    const firstResp = await this.setup.client.submitCertificationRequest(mintCertData);
    if (firstResp.status !== CertificationStatus.SUCCESS) {
      throw new Error(`first split-mint submit failed: ${firstResp.status}`);
    }
    this.firstResponse = firstResp;
    // Stash the cert request for the second submission.
    this.duplicateCertData = mintCertData;
  },
);

When('the same cert request is submitted again', async function (this: TokenWorld): Promise<void> {
  if (!this.duplicateCertData) {
    throw new Error('duplicateCertData missing');
  }
  const resp = await this.setup.client.submitCertificationRequest(this.duplicateCertData);
  this.dupResponseStatus = resp.status;
});

Then('the second submission status is {string}', function (this: TokenWorld, expected: string): void {
  assert.equal(this.dupResponseStatus, expected);
});

Then(
  'the second submission status is one of {string} or {string}',
  function (this: TokenWorld, alt1: string, alt2: string): void {
    const got = this.dupResponseStatus as unknown as string;
    assert.ok(got === alt1 || got === alt2, `expected ${alt1} or ${alt2}, got ${got}`);
  },
);

Then('1 split token is minted', function (this: TokenWorld): void {
  assert.equal(this.splitTokens.length, 1);
});
