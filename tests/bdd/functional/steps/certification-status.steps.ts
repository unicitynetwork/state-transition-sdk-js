import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { PayToPublicKeyPredicate } from '../../../../src/predicate/builtin/PayToPublicKeyPredicate.js';
import { PayToPublicKeyPredicateUnlockScript } from '../../../../src/predicate/builtin/PayToPublicKeyPredicateUnlockScript.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { Address } from '../../../../src/transaction/Address.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../../../src/util/InclusionProofUtils.js';
import { TokenWorld } from '../support/World.js';

When('the user submits a mint request for a specific token ID', async function (this: TokenWorld): Promise<void> {
  this.mintTokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const mintTransaction = await MintTransaction.create(
    await Address.fromPredicate(this.user.predicate),
    this.mintTokenId,
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    CborSerializer.encodeArray(),
  );

  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
  this.firstResponse = await this.setup.client.submitCertificationRequest(certificationData);
});

When('the user submits a second mint request for the same token ID', async function (this: TokenWorld): Promise<void> {
  // Same TokenId → same state ID, but different TokenType → different transaction hash
  const mintTransaction = await MintTransaction.create(
    await Address.fromPredicate(this.user.predicate),
    this.mintTokenId,
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    CborSerializer.encodeArray(),
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
    this.alice.predicate,
    await Address.fromPredicate(this.bob.predicate),
    crypto.getRandomValues(new Uint8Array(32)),
    CborSerializer.encodeArray(),
  );

  const wrongSigningService = new SigningService(SigningService.generatePrivateKey());
  const certificationData = await CertificationData.fromTransaction(
    transferTransaction,
    await PayToPublicKeyPredicateUnlockScript.create(transferTransaction, wrongSigningService),
  );

  const response = await this.setup.client.submitCertificationRequest(certificationData);
  this.certificationStatus = response.status;
});
