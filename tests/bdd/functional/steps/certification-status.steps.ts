import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicateUnlockScript } from '../../../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../../../src/util/InclusionProofUtils.js';
import { TokenWorld } from '../support/World.js';

When('the user submits a mint request for a specific token ID', async function (this: TokenWorld): Promise<void> {
  // PR #119: tokenId is derived from (networkId, salt). Pin the salt so the second mint can
  // reproduce the same tokenId while varying tokenType (→ different transaction hash).
  this.mintTokenSalt = TokenSalt.generate();
  const mintTransaction = await MintTransaction.create(
    this.setup.trustBase.networkId,
    this.user.predicate,
    null,
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    this.mintTokenSalt,
  );
  this.mintTokenId = mintTransaction.tokenId;

  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
  this.firstResponse = await this.setup.client.submitCertificationRequest(certificationData);
});

When('the user submits a second mint request for the same token ID', async function (this: TokenWorld): Promise<void> {
  // Reuse the same salt → identical derived tokenId, but a different tokenType yields a
  // different transaction hash; the conflict surfaces at proof time.
  const mintTransaction = await MintTransaction.create(
    this.setup.trustBase.networkId,
    this.user.predicate,
    null,
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    this.mintTokenSalt,
  );

  this.secondMintTransaction = mintTransaction;
  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
  this.secondResponse = await this.setup.client.submitCertificationRequest(certificationData);
});

Then(
  /^the inclusion proof verification rejects the second mint with "([^"]+)"$/,
  async function (this: TokenWorld, error: string): Promise<void> {
    await assert.rejects(
      () =>
        waitInclusionProof(
          this.setup.client,
          this.setup.trustBase,
          this.setup.predicateVerifier,
          this.secondMintTransaction,
        ),
      (e: Error) => e.message.includes(`Invalid inclusion proof status: ${error}`),
    );
  },
);

When('Alice creates a transfer to Bob signed with the wrong key', async function (this: TokenWorld): Promise<void> {
  const transferTransaction = await TransferTransaction.create(
    this.token,
    this.bob.predicate,
    crypto.getRandomValues(new Uint8Array(32)),
  );

  const wrongSigningService = new SigningService(SigningService.generatePrivateKey());
  const certificationData = await CertificationData.fromTransaction(
    transferTransaction,
    await SignaturePredicateUnlockScript.create(transferTransaction, wrongSigningService),
  );

  const response = await this.setup.client.submitCertificationRequest(certificationData);
  this.certificationStatus = response.status;
});
