import assert from 'node:assert/strict';

import { Then } from '@cucumber/cucumber';

import { RootTrustBase } from '../../../../src/api/bft/RootTrustBase.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { TokenWorld } from '../support/World.js';

Then('the token fails verification against a different trust base', async function (this: TokenWorld): Promise<void> {
  const wrongSigningService = new SigningService(SigningService.generatePrivateKey());
  const wrongTrustBase = RootTrustBase.fromJSON({
    changeRecordHash: null,
    epoch: '0',
    epochStartRound: '0',
    networkId: 2,
    previousEntryHash: null,
    quorumThreshold: '1',
    rootNodes: [{ nodeId: 'WRONG', sigKey: HexConverter.encode(wrongSigningService.publicKey), stake: '1' }],
    signatures: {},
    stateHash: '00',
    version: '0',
  });

  const result = await this.token.verify(
    wrongTrustBase,
    this.setup.predicateVerifier,
    this.setup.mintJustificationVerifier,
  );
  assert.strictEqual(result.status, VerificationStatus.FAIL);
});
