import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';

import { CertificationData } from '../../../../src/api/CertificationData.js';
import { MintTransaction } from '../../../../src/transaction/MintTransaction.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { TokenType } from '../../../../src/transaction/TokenType.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { buildCanonicalCertificationRequest, ICanonicalRequest } from '../support/RawCertificationSubmitter.js';
import { createUser } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

function getStash(world: TokenWorld): NonNullable<TokenWorld['requestDeterminismStash']> {
  if (!world.requestDeterminismStash) {
    throw new Error('requestDeterminismStash not initialised');
  }
  return world.requestDeterminismStash;
}

When('the same logical mint certification_request is built twice', async function (this: TokenWorld): Promise<void> {
  // Fixed logical inputs across both builds. MintTransaction.create is deterministic given
  // (recipient, tokenId, tokenType) — no salt — so two builds must agree byte-for-byte.
  const recipient = createUser().predicate;
  const tokenId = TokenId.generate();
  const tokenType = TokenType.generate();
  const build = async (): Promise<ICanonicalRequest> => {
    const mintTransaction = await MintTransaction.create(recipient, tokenId, tokenType);
    return buildCanonicalCertificationRequest(await CertificationData.fromMintTransaction(mintTransaction));
  };
  this.requestDeterminismStash = { first: await build(), second: await build() };
});

Then('the two certification_request encodings are byte-identical', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.strictEqual(HexConverter.encode(stash.first.bytes), HexConverter.encode(stash.second.bytes));
});

Then('the two stateIds are equal', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.first.stateId.equals(stash.second.stateId));
});
