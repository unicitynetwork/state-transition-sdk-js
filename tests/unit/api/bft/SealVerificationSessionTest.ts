import { TrustBaseHistory } from '../../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { SealVerificationSession } from '../../../../src/api/bft/verification/SealVerificationSession.js';
import { findNoTrustBaseEntry } from '../../../../src/api/bft/verification/TrustBaseEntryResult.js';
import { VerifiedSealCache } from '../../../../src/api/bft/verification/VerifiedSealCache.js';
import { NetworkId } from '../../../../src/api/NetworkId.js';
import { Secp256k1SignatureVerifier } from '../../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import {
  appendNextEpoch,
  createTrustBaseHistoryFromAuthority,
  FIXTURE_EPOCH,
} from '../../../utils/TrustBaseHistoryFixture.js';

const HASH = new Uint8Array(32).fill(0x11);

function signer(fill: number): SigningService {
  return new SigningService(new Uint8Array(32).fill(fill));
}

function trustBase(
  key: Uint8Array,
  options: { epoch?: string; epochStartRound?: string; networkId?: number } = {},
): Promise<TrustBaseHistory> {
  return createTrustBaseHistoryFromAuthority({
    epoch: options.epoch ?? String(FIXTURE_EPOCH),
    epochStartRound: options.epochStartRound ?? '0',
    networkId: options.networkId ?? NetworkId.LOCAL.id,
    quorumThreshold: '1',
    rootNodes: [{ nodeId: 'NODE', sigKey: HexConverter.encode(key), stake: '1' }],
  });
}

function seal(
  by: SigningService,
  options: { epoch?: bigint; network?: NetworkId; round?: bigint; timestamp?: bigint } = {},
): Promise<UnicitySeal> {
  return UnicitySeal.create(
    options.network ?? NetworkId.LOCAL,
    options.round ?? 5n,
    options.epoch ?? FIXTURE_EPOCH,
    options.timestamp ?? 1700000000n,
    null,
    HASH,
    new Map([['NODE', by]]),
  );
}

describe('SealVerificationSession', () => {
  const node = signer(1);
  let verifier: Secp256k1SignatureVerifier;
  let verifySpy: jest.SpyInstance;
  let rule: UnicitySealQuorumSignaturesVerificationRule;
  let history: TrustBaseHistory;
  let session: SealVerificationSession;

  beforeEach(async () => {
    verifier = new Secp256k1SignatureVerifier();
    verifySpy = jest.spyOn(verifier, 'verify');
    rule = new UnicitySealQuorumSignaturesVerificationRule(verifier);
    history = await trustBase(node.publicKey);
    session = new SealVerificationSession(history, rule);
  });

  it('checks the signatures of one seal once for sequential repeats', async () => {
    const s = await seal(node);
    for (let i = 0; i < 5; i++) {
      expect((await session.authenticate(s)).status).toEqual(VerificationStatus.OK);
    }
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(session.stats).toEqual({ inFlightJoins: 0, memoHits: 4, quorumChecks: 1 });
  });

  it('checks once for concurrent requests, they share the running check', async () => {
    const s = await seal(node);
    const results = await Promise.all(Array.from({ length: 16 }, () => session.authenticate(s)));
    expect(results.every((r) => r.status === VerificationStatus.OK)).toBe(true);
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(session.stats.quorumChecks).toEqual(1);
    expect(session.stats.inFlightJoins + session.stats.memoHits).toEqual(15);
  });

  it('does not let altered signatures hit a successful entry', async () => {
    const good = await seal(node);
    expect((await session.authenticate(good)).status).toEqual(VerificationStatus.OK);

    // same unsigned content, valid signature of another key
    const forged = await seal(signer(2));
    expect((await session.authenticate(forged)).status).toEqual(VerificationStatus.FAIL);
    expect(session.stats.quorumChecks).toEqual(2);
  });

  it('does not memoize failures', async () => {
    const forged = await seal(signer(2));
    expect((await session.authenticate(forged)).status).toEqual(VerificationStatus.FAIL);
    expect((await session.authenticate(forged)).status).toEqual(VerificationStatus.FAIL);
    expect(session.stats).toEqual({ inFlightJoins: 0, memoHits: 0, quorumChecks: 2 });
  });

  it('drops a throwing check from the in-flight set', async () => {
    const s = await seal(node);
    verifySpy.mockRejectedValueOnce(new Error('boom'));
    await expect(session.authenticate(s)).rejects.toThrow('boom');
    expect((await session.authenticate(s)).status).toEqual(VerificationStatus.OK);
  });

  it('checks the authority context independently of the memo', async () => {
    const s = await seal(node);
    expect((await session.authenticate(s)).status).toEqual(VerificationStatus.OK);

    const sameKeys = async (options: Parameters<typeof trustBase>[1]): Promise<SealVerificationSession> =>
      new SealVerificationSession(await trustBase(node.publicKey, options), rule);
    expect((await (await sameKeys({ networkId: NetworkId.MAINNET.id })).authenticate(s)).status).toEqual(
      VerificationStatus.FAIL,
    );
    expect((await (await sameKeys({ epoch: '2' })).authenticate(s)).status).toEqual(VerificationStatus.FAIL);
    expect((await (await sameKeys({ epochStartRound: '6' })).authenticate(s)).status).toEqual(VerificationStatus.FAIL);
    expect((await (await sameKeys({ epochStartRound: '5' })).authenticate(s)).status).toEqual(VerificationStatus.OK);
    // seal of a later epoch than the history holds is not accepted either (the typed no-entry failure)
    const later = await session.authenticate(await seal(node, { epoch: 2n }));
    expect(later.status).toEqual(VerificationStatus.FAIL);
    expect(findNoTrustBaseEntry(later)).not.toBeNull();
    expect((await session.authenticate(await seal(node, { round: 0n }))).status).toEqual(VerificationStatus.FAIL);
  });

  it('keys on authority and policy: a memo entry of one does not serve another', async () => {
    const s = await seal(node);
    const a = new SealVerificationSession(await trustBase(node.publicKey), rule, { policy: 'a' });
    const b = new SealVerificationSession(await trustBase(node.publicKey), rule, { policy: 'b' });
    await a.authenticate(s);
    await b.authenticate(s);
    expect(verifySpy).toHaveBeenCalledTimes(2);

    // an authority with another key never gets the success of the first one, even for the same seal
    const impostorTrust = new SealVerificationSession(await trustBase(signer(2).publicKey), rule);
    expect((await impostorTrust.authenticate(s)).status).toEqual(VerificationStatus.FAIL);
  });

  it('bounds retained successes and evicts the oldest', async () => {
    const small = new SealVerificationSession(await trustBase(node.publicKey), rule, { maxEntries: 2 });
    const seals = await Promise.all([1n, 2n, 3n].map((round) => seal(node, { round })));
    for (const s of seals) {
      await small.authenticate(s);
    }
    expect(small.stats.quorumChecks).toEqual(3);
    await small.authenticate(seals[2]);
    await small.authenticate(seals[1]);
    expect(small.stats).toMatchObject({ memoHits: 2, quorumChecks: 3 });
    await small.authenticate(seals[0]);
    expect(small.stats.quorumChecks).toEqual(4);
  });

  it('applies the native seal structure checks before success or memoization', async () => {
    const before = await seal(node, { timestamp: 1n });
    expect((await session.authenticate(before)).status).toEqual(VerificationStatus.FAIL);
    expect((await session.authenticate(await seal(node, { timestamp: 1681971083n }))).status).toEqual(
      VerificationStatus.FAIL,
    );
    expect((await session.authenticate(await seal(node, { timestamp: 1681971084n }))).status).toEqual(
      VerificationStatus.OK,
    );

    // a validly signed quorum plus an unsigned-payload-irrelevant entry without signer id
    const extra = await UnicitySeal.create(
      NetworkId.LOCAL,
      5n,
      FIXTURE_EPOCH,
      1700000000n,
      null,
      HASH,
      new Map([
        ['NODE', node],
        ['', node],
      ]),
    );
    expect((await session.authenticate(extra)).status).toEqual(VerificationStatus.FAIL);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });

  it('keeps verdicts of held epochs when the history grows, and authenticates the new epoch', async () => {
    const history = await trustBase(node.publicKey);
    const operation = new SealVerificationSession(history, rule);
    const identity = operation.identity;
    const s = await seal(node);
    expect((await operation.authenticate(s)).status).toEqual(VerificationStatus.OK);

    // the next epoch (same member) starts at round 100
    await appendNextEpoch(history, 'NODE', new Uint8Array(32).fill(1), 100n);

    // the entry of the first epoch is unchanged: its verdict is served from the memo, while the identity names the new tip
    expect((await operation.authenticate(s)).status).toEqual(VerificationStatus.OK);
    expect(operation.stats).toMatchObject({ memoHits: 1, quorumChecks: 1 });
    expect(operation.identity).not.toEqual(identity);

    // a seal of the new epoch is placed in it, and a round of the first epoch under the new epoch's number is not
    expect((await operation.authenticate(await seal(node, { epoch: 2n, round: 100n }))).status).toEqual(
      VerificationStatus.OK,
    );
    expect((await operation.authenticate(await seal(node, { epoch: 2n, round: 99n }))).status).toEqual(
      VerificationStatus.FAIL,
    );
    // and a seal of the first epoch at a round that belongs to the second is refused
    expect((await operation.authenticate(await seal(node, { round: 100n }))).status).toEqual(VerificationStatus.FAIL);
  });

  it('binds the inner seal cache to the entry the seal is verified against', async () => {
    const cached = new UnicitySealQuorumSignaturesVerificationRule(verifier, new VerifiedSealCache(8));
    const s = await seal(node);
    const own = (await trustBase(node.publicKey)).tip as NonNullable<TrustBaseHistory['tip']>;
    const other = (await trustBase(signer(2).publicKey)).tip as NonNullable<TrustBaseHistory['tip']>;
    expect((await cached.verify(own, s)).status).toEqual(VerificationStatus.OK);
    expect((await cached.verify(other, s)).status).toEqual(VerificationStatus.FAIL);
  });

  it('bounds distinct concurrent checks', async () => {
    const capped = new SealVerificationSession(await trustBase(node.publicKey), rule, { maxInFlight: 2 });
    const seals = await Promise.all([1n, 2n, 3n].map((round) => seal(node, { round })));
    const results = await Promise.allSettled(seals.map((s) => capped.authenticate(s)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    // same seal joins the running check instead of counting against the bound
    const twice = await Promise.all([capped.authenticate(seals[0]), capped.authenticate(seals[0])]);
    expect(twice.every((r) => r.status === VerificationStatus.OK)).toBe(true);
    expect(() => new SealVerificationSession(history, rule, { maxInFlight: 0 })).toThrow();
  });

  it('exposes an identity covering authority and policy', async () => {
    const a = new SealVerificationSession(await trustBase(node.publicKey), rule, { policy: 'a' });
    const b = new SealVerificationSession(await trustBase(node.publicKey), rule, { policy: 'b' });
    const c = new SealVerificationSession(await trustBase(signer(2).publicKey), rule, { policy: 'a' });
    expect(new Set([a.identity, b.identity, c.identity]).size).toEqual(3);
  });

  it('shares the quorum memo between the strict path and the operation verifier, which already placed the seal', async () => {
    const s = await seal(node);
    const entry = history.tip as NonNullable<TrustBaseHistory['tip']>;
    expect((await session.authenticate(s)).status).toEqual(VerificationStatus.OK);
    expect((await session.verifyQuorum(entry, s)).status).toEqual(VerificationStatus.OK);
    expect(session.stats).toMatchObject({ memoHits: 1, quorumChecks: 1 });
    // an epoch the history does not hold is the typed no-entry failure
    const unknown = await session.authenticate(await seal(node, { epoch: 7n }));
    expect(unknown.status).toEqual(VerificationStatus.FAIL);
    expect(findNoTrustBaseEntry(unknown)).not.toBeNull();
  });

  it('rejects an invalid memo size', () => {
    expect(() => new SealVerificationSession(history, rule, { maxEntries: 0 })).toThrow();
  });
});
