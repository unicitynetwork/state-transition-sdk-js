import { When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { PayToPublicKeyPredicateUnlockScript } from '../../../../src/predicate/builtin/PayToPublicKeyPredicateUnlockScript.js';
import { Address } from '../../../../src/transaction/Address.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../../../src/transaction/TransferTransaction.js';
import { waitInclusionProof } from '../../../../src/util/InclusionProofUtils.js';
import { TokenWorld } from '../support/World.js';

When('the user mints a token with empty transaction data', async function (this: TokenWorld): Promise<void> {
  const mintTransaction = await MintTransaction.create(
    await Address.fromPredicate(this.user.predicate),
    new TokenId(crypto.getRandomValues(new Uint8Array(32))),
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    new Uint8Array(0),
  );

  const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
  const response = await this.setup.client.submitCertificationRequest(certificationData);
  this.certificationStatus = response.status;
});

When(
  /^the user mints a token with (\d+)KB of random transaction data$/,
  async function (this: TokenWorld, sizeStr: string): Promise<void> {
    const size = parseInt(sizeStr, 10) * 1024;
    const data = crypto.getRandomValues(new Uint8Array(size));
    const mintTransaction = await MintTransaction.create(
      await Address.fromPredicate(this.user.predicate),
      new TokenId(crypto.getRandomValues(new Uint8Array(32))),
      new TokenType(crypto.getRandomValues(new Uint8Array(32))),
      data,
    );

    const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
    const response = await this.setup.client.submitCertificationRequest(certificationData);
    this.certificationStatus = response.status;
  },
);

When(
  /^Alice transfers the token to Bob with (\d+)KB of random data$/,
  async function (this: TokenWorld, sizeStr: string): Promise<void> {
    const size = parseInt(sizeStr, 10) * 1024;
    const data = crypto.getRandomValues(new Uint8Array(size));
    const transferTransaction = await TransferTransaction.create(
      this.token,
      this.alice.predicate,
      await Address.fromPredicate(this.bob.predicate),
      crypto.getRandomValues(new Uint8Array(32)),
      data,
    );

    const certificationData = await CertificationData.fromTransaction(
      transferTransaction,
      await PayToPublicKeyPredicateUnlockScript.create(transferTransaction, this.alice.signingService),
    );

    const response = await this.setup.client.submitCertificationRequest(certificationData);
    if (response.status !== CertificationStatus.SUCCESS) {
      throw new Error(`Transfer certification failed: ${response.status}`);
    }

    this.transferredToken = await this.token.transfer(
      this.setup.trustBase,
      this.setup.predicateVerifier,
      await transferTransaction.toCertifiedTransaction(
        this.setup.trustBase,
        this.setup.predicateVerifier,
        await waitInclusionProof(
          this.setup.client,
          this.setup.trustBase,
          this.setup.predicateVerifier,
          transferTransaction,
        ),
      ),
    );
  },
);
