import { signEntry, testSecret } from './trustbase/TrustBaseTestUtils.js';
import { RootTrustBaseV2 } from '../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseHistory } from '../../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { UnicitySealTrustBaseEntryRule } from '../../../../src/api/bft/verification/rule/UnicitySealTrustBaseEntryRule.js';
import {
  findNoTrustBaseEntry,
  NoTrustBaseEntryResult,
} from '../../../../src/api/bft/verification/TrustBaseEntryResult.js';
import { UnicityCertificateVerifier } from '../../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { InclusionProof } from '../../../../src/api/InclusionProof.js';
import { NetworkId } from '../../../../src/api/NetworkId.js';
import { DataHasher } from '../../../../src/crypto/hash/DataHasher.js';
import { HashAlgorithm } from '../../../../src/crypto/hash/HashAlgorithm.js';
import { Secp256k1SignatureVerifier } from '../../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { VerificationResult } from '../../../../src/verification/VerificationResult.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import {
  createTrustBaseHistoryOf,
  FIXTURE_EPOCH,
  genesisFields,
  IFixtureMember,
} from '../../../utils/TrustBaseHistoryFixture.js';
import { createUnicityCertificate } from '../../../utils/UnicityCertificateFixture.js';

const HASH = new Uint8Array(32).fill(0x22);
const EPOCH2_START = 100n;

function service(name: string): SigningService {
  return new SigningService(testSecret(name));
}

function members(weights: Record<string, bigint>): IFixtureMember[] {
  return Object.entries(weights).map(([nodeId, weight]) => ({
    nodeId,
    publicKey: service(nodeId).publicKey,
    weight,
  }));
}

function seal(
  epoch: bigint,
  round: bigint,
  signers: string[],
  network: NetworkId = NetworkId.LOCAL,
): Promise<UnicitySeal> {
  return UnicitySeal.create(network, round, epoch, 0n, null, HASH, new Map(signers.map((n) => [n, service(n)])));
}

/** Epoch 1 (round 0..99) of a, b, c with weight 1 each, and epoch 2 starting at round 100 signed by all three. */
async function twoEpochs(): Promise<TrustBaseHistory> {
  const history = await createTrustBaseHistoryOf(members({ a: 1n, b: 1n, c: 1n }));
  const genesis = history.entries[0];
  const next = RootTrustBaseV2.decode(
    signEntry(
      {
        ...genesisFields(members({ a: 1n, b: 1n, c: 1n })),
        epoch: FIXTURE_EPOCH + 1n,
        epochStart: EPOCH2_START,
        previousEntryId: await genesis.entryId(),
      },
      ['a', 'b', 'c'],
    ),
  );
  await history.append(next);
  return history;
}

describe('UnicitySealTrustBaseEntryRule', () => {
  it('places a seal in the entry of its epoch, inside the epoch interval', async () => {
    const history = await twoEpochs();

    expect(UnicitySealTrustBaseEntryRule.verify(history, await seal(1n, 0n, [])).entry?.epoch).toBe(1n);
    expect(UnicitySealTrustBaseEntryRule.verify(history, await seal(1n, 99n, [])).entry?.epoch).toBe(1n);
    expect(UnicitySealTrustBaseEntryRule.verify(history, await seal(2n, 100n, [])).entry?.epoch).toBe(2n);
    expect(UnicitySealTrustBaseEntryRule.verify(history, await seal(2n, 10_000n, [])).entry?.epoch).toBe(2n);
  });

  it('fails a seal of an epoch past the tip with the typed no-entry result, which names the epoch', async () => {
    const result = UnicitySealTrustBaseEntryRule.verify(await twoEpochs(), await seal(3n, 500n, []));

    expect(result).toBeInstanceOf(NoTrustBaseEntryResult);
    expect(result.status).toBe(VerificationStatus.FAIL);
    expect((result as NoTrustBaseEntryResult).epoch).toBe(3n);
    expect((result as NoTrustBaseEntryResult).tipEpoch).toBe(2n);
  });

  it('fails a seal of an epoch before the genesis with an ordinary failure: no fetch can supply it', async () => {
    const result = UnicitySealTrustBaseEntryRule.verify(await twoEpochs(), await seal(0n, 0n, []));
    expect(result.status).toBe(VerificationStatus.FAIL);
    expect(result).not.toBeInstanceOf(NoTrustBaseEntryResult);
    expect(result.message).toMatch(/before the genesis/);
  });

  it('fails any seal against an empty history as no entry, as a later fetch can fill it', async () => {
    const empty = TrustBaseHistory.create(new Uint8Array(32));
    const result = UnicitySealTrustBaseEntryRule.verify(empty, await seal(1n, 0n, []));
    expect(result).toBeInstanceOf(NoTrustBaseEntryResult);
    expect((result as NoTrustBaseEntryResult).tipEpoch).toBeNull();
  });

  it('checks the network before the epoch lookup: another network past the tip is not a no-entry', async () => {
    const result = UnicitySealTrustBaseEntryRule.verify(await twoEpochs(), await seal(9n, 0n, [], NetworkId.MAINNET));
    expect(result.status).toBe(VerificationStatus.FAIL);
    expect(result).not.toBeInstanceOf(NoTrustBaseEntryResult);
    expect(result.message).toMatch(/another network/);
  });

  it('fails a seal outside its epoch interval with an ordinary failure, not the no-entry one', async () => {
    const history = await twoEpochs();

    const late = UnicitySealTrustBaseEntryRule.verify(history, await seal(1n, EPOCH2_START, []));
    expect(late.status).toBe(VerificationStatus.FAIL);
    expect(late).not.toBeInstanceOf(NoTrustBaseEntryResult);
    expect(late.message).toMatch(/at or after the start/);

    const early = UnicitySealTrustBaseEntryRule.verify(history, await seal(2n, EPOCH2_START - 1n, []));
    expect(early.status).toBe(VerificationStatus.FAIL);
    expect(early).not.toBeInstanceOf(NoTrustBaseEntryResult);
    expect(early.message).toMatch(/before the start/);
  });

  it('fails a seal of another network', async () => {
    const result = UnicitySealTrustBaseEntryRule.verify(await twoEpochs(), await seal(1n, 0n, [], NetworkId.MAINNET));

    expect(result.status).toBe(VerificationStatus.FAIL);
    expect(result).not.toBeInstanceOf(NoTrustBaseEntryResult);
    expect(result.message).toMatch(/another network/);
  });
});

describe('weighted seal quorum', () => {
  const rule = new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier());

  async function verdict(weights: Record<string, bigint>, signers: string[]): Promise<VerificationStatus> {
    const entry = (await createTrustBaseHistoryOf(members(weights))).entries[0];
    return (await rule.verify(entry, await seal(1n, 0n, signers))).status;
  }

  it('is reached by weight, not by the number of signers', async () => {
    // total 100: threshold 67. The heavy member alone is a quorum; both light members together are not.
    const weights = { a: 98n, b: 1n, c: 1n };
    expect(await verdict(weights, ['a'])).toBe(VerificationStatus.OK);
    expect(await verdict(weights, ['b', 'c'])).toBe(VerificationStatus.FAIL);
  });

  it('needs the whole weight where the threshold equals the total, and is one short of it otherwise', async () => {
    // total 3: threshold 3.
    expect(await verdict({ a: 1n, b: 1n, c: 1n }, ['a', 'b', 'c'])).toBe(VerificationStatus.OK);
    expect(await verdict({ a: 1n, b: 1n, c: 1n }, ['a', 'b'])).toBe(VerificationStatus.FAIL);
    // total 5: threshold 4, so the member of weight 3 needs a second one.
    expect(await verdict({ a: 3n, b: 1n, c: 1n }, ['a'])).toBe(VerificationStatus.FAIL);
    expect(await verdict({ a: 3n, b: 1n, c: 1n }, ['a', 'b'])).toBe(VerificationStatus.OK);
  });

  it('counts an unknown signer or a signature that does not verify as zero, and still reaches quorum with the rest (upstream seal rule)', async () => {
    const entry = (await createTrustBaseHistoryOf(members({ a: 1n, b: 1n, c: 1n }))).entries[0];
    const good = await seal(1n, 0n, ['a', 'b', 'c']);

    const unknown = await UnicitySeal.create(
      NetworkId.LOCAL,
      0n,
      1n,
      0n,
      null,
      HASH,
      new Map([
        ['a', service('a')],
        ['b', service('b')],
        ['c', service('c')],
        ['zz', service('d')],
      ]),
    );
    expect((await rule.verify(entry, unknown)).status).toBe(VerificationStatus.OK);

    // c's signature replaced by d's: it does not verify under c's key and counts zero.
    const forged = await UnicitySeal.create(
      NetworkId.LOCAL,
      0n,
      1n,
      0n,
      null,
      HASH,
      new Map([
        ['a', service('a')],
        ['b', service('b')],
        ['c', service('d')],
      ]),
    );
    expect((await rule.verify(entry, forged)).status).toBe(VerificationStatus.FAIL);
    expect((await rule.verify(entry, good)).status).toBe(VerificationStatus.OK);

    // With a spare member the same forged signature is ignored rather than fatal.
    const spare = (await createTrustBaseHistoryOf(members({ a: 1n, b: 1n, c: 1n, d: 1n }))).entries[0];
    const withForged = await UnicitySeal.create(
      NetworkId.LOCAL,
      0n,
      1n,
      0n,
      null,
      HASH,
      new Map([
        ['a', service('a')],
        ['b', service('b')],
        ['d', service('d')],
        ['c', service('a')],
      ]),
    );
    expect((await rule.verify(spare, withForged)).status).toBe(VerificationStatus.OK);
  });
});

describe('UnicityCertificateVerifier with a history', () => {
  async function verify(history: TrustBaseHistory, epoch: bigint): Promise<VerificationResult<VerificationStatus>> {
    const signer = service('a');
    const rootHash = await new DataHasher(HashAlgorithm.SHA256).update(HASH).digest();
    const certificate = await createUnicityCertificate(rootHash, signer, 0n, { sealEpoch: epoch });
    const verifier = new UnicityCertificateVerifier(
      new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
    );
    return verifier.verify(history, { unicityCertificate: certificate } as unknown as InclusionProof);
  }

  it('reports the missing epoch in the trace so a caller can fetch and retry', async () => {
    const history = await createTrustBaseHistoryOf(members({ a: 1n }));
    const result = await verify(history, 5n);

    expect(result.status).toBe(VerificationStatus.FAIL);
    expect(findNoTrustBaseEntry(result)?.epoch).toBe(5n);
  });
});
