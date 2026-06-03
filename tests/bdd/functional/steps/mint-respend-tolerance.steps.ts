import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { CertificationStatus } from '../../../../src/api/CertificationResponse.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenSalt } from '../../../../src/transaction/TokenSalt.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { waitInclusionProof } from '../../../../src/util/InclusionProofUtils.js';
import { createUser } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

interface IMintRespendStash {
  firstMint: MintTransaction;
  respendStatus?: CertificationStatus | null;
  respendSubmitError?: Error;
  secondMint?: MintTransaction;
  sharedSalt: TokenSalt;
  sharedTokenType: TokenType;
}

function getStash(world: TokenWorld): IMintRespendStash {
  if (!world.mintRespendStash) {
    throw new Error('mintRespendStash not initialised');
  }
  return world.mintRespendStash;
}

Given(
  'Alice mints and certifies a token with a fixed salt and empty data',
  async function (this: TokenWorld): Promise<void> {
    this.alice = createUser();
    const sharedSalt = TokenSalt.fromBytes(crypto.getRandomValues(new Uint8Array(32)));
    const sharedTokenType = TokenType.generate();
    const firstMint = await MintTransaction.create(
      this.setup.trustBase.networkId,
      this.alice.predicate,
      null,
      sharedTokenType,
      sharedSalt,
    );
    const certificationData = await CertificationData.fromMintTransaction(firstMint);
    const response = await this.setup.client.submitCertificationRequest(certificationData);
    assert.strictEqual(
      response.status,
      CertificationStatus.SUCCESS,
      `expected first mint to certify; got ${String(response.status)}`,
    );
    this.mintRespendStash = { firstMint, sharedSalt, sharedTokenType };
  },
);

When(
  'Alice tries to submit a second mint at the same stateId but with different data',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    // Same salt/networkId/recipient/tokenType pin tokenId → stateId. A non-null data
    // field gives the new MintTransaction different bytes (and therefore a different
    // transactionHash) at the same stateId — the conflict the aggregator should reject.
    stash.secondMint = await MintTransaction.create(
      this.setup.trustBase.networkId,
      this.alice.predicate,
      new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      stash.sharedTokenType,
      stash.sharedSalt,
    );
    const certificationData = await CertificationData.fromMintTransaction(stash.secondMint);
    try {
      const response = await this.setup.client.submitCertificationRequest(certificationData);
      stash.respendStatus = response.status;
    } catch (error) {
      stash.respendStatus = null;
      stash.respendSubmitError = error instanceof Error ? error : new Error(String(error));
    }
  },
);

Then('the re-mint is rejected as a double-spend', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  if (stash.respendStatus === null) {
    assert.ok(stash.respendSubmitError, 'submit was reported as failed but no error was captured');
    return;
  }
  // Submit-side accepted (SUCCESS) — the conflict must surface at proof time.
  assert.strictEqual(
    stash.respendStatus,
    CertificationStatus.SUCCESS,
    `re-mint submit status should be SUCCESS, got ${String(stash.respendStatus)}`,
  );
  assert.ok(stash.secondMint, 'secondMint missing');
  await assert.rejects(
    () => waitInclusionProof(this.setup.client, this.setup.trustBase, this.setup.predicateVerifier, stash.secondMint!),
    (e: Error) => e.message.includes('TRANSACTION_HASH_MISMATCH'),
  );
});
