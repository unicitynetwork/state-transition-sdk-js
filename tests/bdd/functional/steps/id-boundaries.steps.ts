import { When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { Address } from '../../../../src/transaction/Address.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { TokenWorld } from '../support/World.js';

When(
  /^the user submits a mint request with a (\d+)-byte token ID$/,
  async function (this: TokenWorld, lengthStr: string): Promise<void> {
    const length = parseInt(lengthStr, 10);
    const bytes = length > 0 ? crypto.getRandomValues(new Uint8Array(length)) : new Uint8Array(0);

    const mintTransaction = await MintTransaction.create(
      await Address.fromPredicate(this.user.predicate),
      new TokenId(bytes),
      new TokenType(crypto.getRandomValues(new Uint8Array(32))),
      CborSerializer.encodeArray(),
    );

    const certificationData = await CertificationData.fromMintTransaction(mintTransaction);
    const response = await this.setup.client.submitCertificationRequest(certificationData);
    this.certificationStatus = response.status;
  },
);
