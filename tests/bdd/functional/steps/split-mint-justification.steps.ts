import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { NetworkId } from '../../../../src/api/NetworkId.js';
import { Asset } from '../../../../src/payment/asset/Asset.js';
import { AssetId } from '../../../../src/payment/asset/AssetId.js';
import { PaymentAssetCollection } from '../../../../src/payment/asset/PaymentAssetCollection.js';
import { SplitMintJustification } from '../../../../src/payment/SplitMintJustification.js';
import { SplitMintJustificationVerifier } from '../../../../src/payment/SplitMintJustificationVerifier.js';
import { CertifiedMintTransaction } from '../../../../src/transaction/CertifiedMintTransaction.js';
import { TokenId } from '../../../../src/transaction/TokenId.js';
import { VerificationResult } from '../../../../src/verification/VerificationResult.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import {
  createAssetId,
  createUser,
  mintTokenWithAssets,
  parseSimplePaymentData,
  parseSplitVerificationData,
  splitToken,
} from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

/**
 * Stash for split-mint-justification scenarios.
 * Builds a real split-mint via aggregator once per scenario (Background) and exposes
 * the underlying CertifiedMintTransaction + decoded SplitMintJustification for surgical
 * mutation testing.
 */
interface ISplitJustificationStash {
  certMint: CertifiedMintTransaction;
  decoded: SplitMintJustification;
  mutatedCert?: CertifiedMintTransaction;
  thrownError?: Error;
  verifyResult?: VerificationResult<VerificationStatus>;
}

function getStash(world: TokenWorld): ISplitJustificationStash {
  if (!world.splitJustificationStash) {
    throw new Error('splitJustificationStash not initialised — run the Background step first');
  }
  return world.splitJustificationStash;
}

Given('Alice has split-minted 2 tokens with 2 payment assets', async function (this: TokenWorld): Promise<void> {
  this.alice = createUser();
  this.assetId1 = createAssetId();
  this.assetId2 = createAssetId();
  const assets = PaymentAssetCollection.create(new Asset(this.assetId1, 100n), new Asset(this.assetId2, 200n));
  this.token = await mintTokenWithAssets(this.setup, this.alice, assets);

  const splitTokenId1 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const splitTokenId2 = new TokenId(crypto.getRandomValues(new Uint8Array(32)));
  const splitAssets: [TokenId, PaymentAssetCollection][] = [
    [splitTokenId1, PaymentAssetCollection.create(new Asset(this.assetId1, 60n), new Asset(this.assetId2, 120n))],
    [splitTokenId2, PaymentAssetCollection.create(new Asset(this.assetId1, 40n), new Asset(this.assetId2, 80n))],
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

  const certMint = result.splitTokens[0].genesis;
  const justificationBytes = certMint.justification;
  if (!justificationBytes) {
    throw new Error('split mint has no justification — fixture is broken');
  }
  this.splitJustificationStash = {
    certMint,
    decoded: await SplitMintJustification.fromCBOR(justificationBytes),
  };
});

// =============================================================================
// Tier 1.1 — round-trip and constructor invariant
// =============================================================================

Given("the SplitMintJustification of one of Alice's split tokens", function (this: TokenWorld): void {
  // Background already populated splitJustificationStash; this Given is a contextual no-op.
  getStash(this);
});

When('the justification is encoded and decoded back', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  const reEncoded = stash.decoded.toCBOR();
  const redecoded = await SplitMintJustification.fromCBOR(reEncoded);
  this.cborRoundtripFirst = stash.decoded.token.toCBOR();
  this.cborRoundtripSecond = redecoded.token.toCBOR();
});

Then("the decoded token's CBOR equals the original token's CBOR", function (this: TokenWorld): void {
  assert.equal(
    Buffer.from(this.cborRoundtripFirst!).toString('hex'),
    Buffer.from(this.cborRoundtripSecond!).toString('hex'),
  );
});

Then('the decoded proofs equal the original proofs', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  const reEncoded = stash.decoded.toCBOR();
  const redecoded = await SplitMintJustification.fromCBOR(reEncoded);
  assert.equal(redecoded.proofs.length, stash.decoded.proofs.length);
  for (let i = 0; i < redecoded.proofs.length; i++) {
    assert.equal(
      Buffer.from(redecoded.proofs[i].toCBOR()).toString('hex'),
      Buffer.from(stash.decoded.proofs[i].toCBOR()).toString('hex'),
    );
  }
});

When('SplitMintJustification.create is called with an empty proof list', function (this: TokenWorld): void {
  const stash = getStash(this);
  try {
    SplitMintJustification.create(stash.decoded.token, []);
  } catch (e) {
    stash.thrownError = e as Error;
  }
});

Then('an error is thrown with message containing {string}', function (this: TokenWorld, fragment: string): void {
  const stash = getStash(this);
  assert.ok(stash.thrownError, 'expected an error');
  assert.ok(
    stash.thrownError.message.toLowerCase().includes(fragment.toLowerCase()),
    `expected "${fragment}" in "${stash.thrownError.message}"`,
  );
});

When(
  'the justification bytes are decoded via SplitMintJustification.fromCBOR',
  async function (this: TokenWorld): Promise<void> {
    const stash = getStash(this);
    try {
      await SplitMintJustification.fromCBOR(stash.decoded.toCBOR());
    } catch (e) {
      stash.thrownError = e as Error;
    }
  },
);

Then('no decoding error is raised', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.equal(stash.thrownError, undefined, `unexpected: ${stash.thrownError?.message}`);
});

// =============================================================================
// Tier 1.2 — verifier mutation harness
// =============================================================================

function mockCert(
  base: CertifiedMintTransaction,
  overrides: Partial<Pick<CertifiedMintTransaction, 'justification' | 'data' | 'tokenId' | 'networkId'>>,
): CertifiedMintTransaction {
  return {
    data: overrides.data !== undefined ? overrides.data : base.data,
    justification: overrides.justification !== undefined ? overrides.justification : base.justification,
    networkId: overrides.networkId ?? base.networkId,
    tokenId: overrides.tokenId ?? base.tokenId,
  } as unknown as CertifiedMintTransaction;
}

Given(/^a CertifiedMintTransaction is mutated by (.+)$/, function (this: TokenWorld, mutationLabel: string): void {
  const stash = getStash(this);
  const base = stash.certMint;

  switch (mutationLabel) {
    case 'stripping the justification field': {
      stash.mutatedCert = mockCert(base, { justification: null });
      break;
    }
    case 'stripping the data field': {
      stash.mutatedCert = mockCert(base, { data: null });
      break;
    }
    case 'adding an extra asset to data not present in proofs': {
      const originalAssets = PaymentAssetCollection.fromCBOR(base.data!);
      const extra = new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(32))), 1n);
      const tampered = PaymentAssetCollection.create(...originalAssets.toArray(), extra);
      stash.mutatedCert = mockCert(base, { data: tampered.toCBOR() });
      break;
    }
    case "renaming one proof's assetId to one not in data": {
      // The verifier checks aggregation/asset paths *before* the data lookup, so renaming
      // the assetId on the proof side trips path verification first. To exercise the
      // "Asset id ... not found in asset data" branch we instead rename one asset id on the
      // *data* side: proofs stay valid, but their assetIds no longer appear in payment data.
      const originalAssets = PaymentAssetCollection.fromCBOR(base.data!);
      const arr = originalAssets.toArray();
      const renamed = arr.map((a, i) =>
        i === 0 ? new Asset(new AssetId(crypto.getRandomValues(new Uint8Array(32))), a.value) : a,
      );
      const tampered = PaymentAssetCollection.create(...renamed);
      stash.mutatedCert = mockCert(base, { data: tampered.toCBOR() });
      break;
    }
    case "mismatching one asset's value between data and tree": {
      const originalAssets = PaymentAssetCollection.fromCBOR(base.data!);
      const arr = originalAssets.toArray();
      const bumped = arr.map((a, i) => (i === 0 ? new Asset(a.id, a.value + 1n) : a));
      const tampered = PaymentAssetCollection.create(...bumped);
      stash.mutatedCert = mockCert(base, { data: tampered.toCBOR() });
      break;
    }
    case 'swapping the mint networkId to a different network': {
      // PR #119 / sdk-js#116: SplitMintJustificationVerifier line 62 fails if the cert mint's
      // networkId differs from the burnt source token's genesis.networkId. Pick a guaranteed-
      // different networkId (LOCAL=3 vs MAINNET=1) without breaking the rest of the cert.
      const sourceId = base.networkId.id;
      const altId = sourceId === 1 ? 2 : 1;
      stash.mutatedCert = mockCert(base, { networkId: NetworkId.fromId(altId) });
      break;
    }
    case 'duplicating one proof so two share an assetId': {
      // PR #114 added an early dedup check at the top of each proof iteration. Using two
      // copies of a genuine proof keeps the first iteration valid (so it lands in the
      // validated-assets set) and trips the dedup check on the second.
      const proofs = stash.decoded.proofs;
      const tamperedJustification = SplitMintJustification.create(stash.decoded.token, [proofs[0], proofs[0]]);
      stash.mutatedCert = mockCert(base, { justification: tamperedJustification.toCBOR() });
      break;
    }
    default:
      throw new Error(`Unknown mutation: ${mutationLabel}`);
  }
});

When('SplitMintJustificationVerifier.verify is invoked', async function (this: TokenWorld): Promise<void> {
  const stash = getStash(this);
  if (!stash.mutatedCert) {
    throw new Error('mutatedCert missing — Given step skipped?');
  }
  const verifier = new SplitMintJustificationVerifier(
    this.setup.trustBase,
    this.setup.predicateVerifier,
    parseSplitVerificationData,
  );
  stash.verifyResult = await verifier.verify(stash.mutatedCert, this.setup.mintJustificationVerifier);
});

Then('the verification result is FAIL', function (this: TokenWorld): void {
  const stash = getStash(this);
  assert.ok(stash.verifyResult, 'verifyResult missing — When step skipped?');
  assert.equal(
    stash.verifyResult.status,
    VerificationStatus.FAIL,
    `expected FAIL, got ${stash.verifyResult.status}: ${stash.verifyResult.message}`,
  );
});

Then('the failure message contains {string}', function (this: TokenWorld, fragment: string): void {
  const stash = getStash(this);
  assert.ok(stash.verifyResult, 'verifyResult missing');
  const haystack = (stash.verifyResult.message ?? '').toLowerCase();
  assert.ok(haystack.includes(fragment.toLowerCase()), `expected "${fragment}" in "${stash.verifyResult.message}"`);
});
