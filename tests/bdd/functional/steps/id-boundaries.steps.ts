import { When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenWorld } from '../support/World.js';

When(
  /^the user submits a mint request with a (\d+)-byte token ID$/,
  async function (this: TokenWorld, lengthStr: string): Promise<void> {
    // PR #119: tokenId is always SHA-256(CBOR(salt, networkId)) → 32 bytes. The scenario's byte
    // length parameter no longer affects the on-wire mint payload; the scenarios still serve as
    // a smoke check that minting succeeds, but they don't pin a tokenId byte-length boundary.
    void lengthStr;
    const mintTransaction = await MintTransaction.create(this.setup.trustBase.networkId, this.user.predicate);

    const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
    const response = await this.setup.client.submitCertificationRequest(certificationData);
    this.certificationStatus = response.status;
  },
);
