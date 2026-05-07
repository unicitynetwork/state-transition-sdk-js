import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';

import { SplitMintJustificationVerifier } from '../../../../src/payment/SplitMintJustificationVerifier.js';
import { CborSerializer } from '../../../../src/serialization/cbor/CborSerializer.js';
import { CertifiedMintTransaction } from '../../../../src/transaction/CertifiedMintTransaction.js';
import { IMintJustificationVerifier } from '../../../../src/transaction/verification/IMintJustificationVerifier.js';
import { MintJustificationVerifierService } from '../../../../src/transaction/verification/MintJustificationVerifierService.js';
import { VerificationResult } from '../../../../src/verification/VerificationResult.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { parseSplitVerificationData } from '../support/TestSetup.js';
import { TokenWorld } from '../support/World.js';

interface IRegistryStash {
  result?: VerificationResult<VerificationStatus>;
  service: MintJustificationVerifierService;
  stubInvocations: number;
  stubTag?: bigint;
  thrownError?: Error;
}

function getRegistryStash(world: TokenWorld): IRegistryStash {
  if (!world.registryStash) {
    throw new Error('registryStash not initialised — run a Given step first');
  }
  return world.registryStash;
}

class StubMintJustificationVerifier implements IMintJustificationVerifier {
  public constructor(
    public readonly tag: bigint,
    private readonly recordInvocation: () => void,
  ) {}

  public verify(): Promise<VerificationResult<VerificationStatus>> {
    this.recordInvocation();
    return Promise.resolve(new VerificationResult('StubVerifier', VerificationStatus.OK));
  }
}

function buildMockCertWithJustificationTag(tag: bigint): CertifiedMintTransaction {
  // Inner CBOR shape doesn't matter — the registry only inspects the outer tag.
  const justification = CborSerializer.encodeTag(tag, CborSerializer.encodeArray());
  return {
    data: null,
    justification,
    tokenId: undefined,
  } as unknown as CertifiedMintTransaction;
}

Given('a fresh MintJustificationVerifierService is created', function (this: TokenWorld): void {
  this.registryStash = {
    service: new MintJustificationVerifierService(),
    stubInvocations: 0,
  };
});

Given('a SplitMintJustificationVerifier is registered', function (this: TokenWorld): void {
  const stash = getRegistryStash(this);
  stash.service.register(
    new SplitMintJustificationVerifier(this.setup.trustBase, this.setup.predicateVerifier, parseSplitVerificationData),
  );
});

Given('a stub verifier for tag {int} is registered', function (this: TokenWorld, tag: number): void {
  const stash = getRegistryStash(this);
  stash.stubTag = BigInt(tag);
  stash.service.register(
    new StubMintJustificationVerifier(BigInt(tag), () => {
      stash.stubInvocations += 1;
    }),
  );
});

When('a second verifier with the same tag is registered', function (this: TokenWorld): void {
  const stash = getRegistryStash(this);
  try {
    stash.service.register(
      new SplitMintJustificationVerifier(
        this.setup.trustBase,
        this.setup.predicateVerifier,
        parseSplitVerificationData,
      ),
    );
  } catch (e) {
    stash.thrownError = e as Error;
  }
});

When(
  'verify is invoked on a CertifiedMintTransaction with null justification',
  async function (this: TokenWorld): Promise<void> {
    const stash = getRegistryStash(this);
    const cert = { data: null, justification: null, tokenId: undefined } as unknown as CertifiedMintTransaction;
    stash.result = await stash.service.verify(cert);
  },
);

When(
  /^verify is invoked on a CertifiedMintTransaction whose justification uses tag (\d+)$/,
  async function (this: TokenWorld, tag: string): Promise<void> {
    const stash = getRegistryStash(this);
    const cert = buildMockCertWithJustificationTag(BigInt(tag));
    stash.result = await stash.service.verify(cert);
  },
);

Then('the result status is OK', function (this: TokenWorld): void {
  const stash = getRegistryStash(this);
  assert.ok(stash.result, 'no result captured');
  assert.equal(stash.result.status, VerificationStatus.OK, `got ${stash.result.status}: ${stash.result.message}`);
});

Then('the result status is FAIL', function (this: TokenWorld): void {
  const stash = getRegistryStash(this);
  assert.ok(stash.result, 'no result captured');
  assert.equal(stash.result.status, VerificationStatus.FAIL, `got ${stash.result.status}: ${stash.result.message}`);
});

Then('the registration error message contains {string}', function (this: TokenWorld, fragment: string): void {
  const stash = getRegistryStash(this);
  assert.ok(stash.thrownError, 'expected a thrown error during registration');
  assert.ok(
    stash.thrownError.message.toLowerCase().includes(fragment.toLowerCase()),
    `expected "${fragment}" in "${stash.thrownError.message}"`,
  );
});

Then('the registry result message contains {string}', function (this: TokenWorld, fragment: string): void {
  const stash = getRegistryStash(this);
  const message = stash.result?.message ?? '';
  // Search nested results too — the registry wraps inner verifier results.
  const collected: string[] = [message];
  const visit = (results: VerificationResult<unknown>[]): void => {
    for (const r of results) {
      collected.push(r.message ?? '');
      visit(r.results ?? []);
    }
  };
  visit(stash.result?.results ?? []);
  assert.ok(
    collected.some((m) => m.toLowerCase().includes(fragment.toLowerCase())),
    `expected "${fragment}" in any of: ${collected.join(' | ')}`,
  );
});

Then('the stub verifier was invoked exactly once', function (this: TokenWorld): void {
  const stash = getRegistryStash(this);
  assert.equal(stash.stubInvocations, 1);
});
