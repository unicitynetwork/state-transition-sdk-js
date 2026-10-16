import { RootTrustBase } from '../../../../src/api/bft/RootTrustBase.js';
import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { SealVerificationSession } from '../../../../src/api/bft/verification/SealVerificationSession.js';
import { VerifiedSealCache } from '../../../../src/api/bft/verification/VerifiedSealCache.js';
import { NetworkId } from '../../../../src/api/NetworkId.js';
import { Secp256k1SignatureVerifier } from '../../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';

const HASH = new Uint8Array(32).fill(0x11);

function signer(fill: number): SigningService {
  return new SigningService(new Uint8Array(32).fill(fill));
}

function trustBase(
  key: Uint8Array,
  options: { epoch?: string; epochStartRound?: string; networkId?: number } = {},
): RootTrustBase {
  return RootTrustBase.fromJSON({
    changeRecordHash: null,
    epoch: options.epoch ?? '0',
    epochStartRound: options.epochStartRound ?? '0',
    networkId: options.networkId ?? NetworkId.LOCAL.id,
    previousEntryHash: null,
    quorumThreshold: '1',
    rootNodes: [{ nodeId: 'NODE', sigKey: HexConverter.encode(key), stake: '1' }],
    signatures: {},
    stateHash: '00',
    version: '1',
  });
}

function seal(
  by: SigningService,
  options: { epoch?: bigint; network?: NetworkId; round?: bigint; timestamp?: bigint } = {},
): Promise<UnicitySeal> {
  return UnicitySeal.create(
    options.network ?? NetworkId.LOCAL,
    options.round ?? 5n,
    options.epoch ?? 0n,
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
  let session: SealVerificationSession;

  beforeEach(() => {
    verifier = new Secp256k1SignatureVerifier();
    verifySpy = jest.spyOn(verifier, 'verify');
    rule = new UnicitySealQuorumSignaturesVerificationRule(verifier);
    session = new SealVerificationSession(trustBase(node.publicKey), rule);
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

    const sameKeys = (options: Parameters<typeof trustBase>[1]): SealVerificationSession =>
      new SealVerificationSession(trustBase(node.publicKey, options), rule);
    expect((await sameKeys({ networkId: NetworkId.TESTNET.id }).authenticate(s)).status).toEqual(
      VerificationStatus.FAIL,
    );
    expect((await sameKeys({ epoch: '1' }).authenticate(s)).status).toEqual(VerificationStatus.FAIL);
    expect((await sameKeys({ epochStartRound: '6' }).authenticate(s)).status).toEqual(VerificationStatus.FAIL);
    expect((await sameKeys({ epochStartRound: '5' }).authenticate(s)).status).toEqual(VerificationStatus.OK);
    // seal of a later epoch than the trust base is not accepted either
    expect((await session.authenticate(await seal(node, { epoch: 1n }))).status).toEqual(VerificationStatus.FAIL);
    expect((await session.authenticate(await seal(node, { round: 0n }))).status).toEqual(VerificationStatus.FAIL);
  });

  it('keys on authority and policy: a memo entry of one does not serve another', async () => {
    const s = await seal(node);
    const a = new SealVerificationSession(trustBase(node.publicKey), rule, { policy: 'a' });
    const b = new SealVerificationSession(trustBase(node.publicKey), rule, { policy: 'b' });
    await a.authenticate(s);
    await b.authenticate(s);
    expect(verifySpy).toHaveBeenCalledTimes(2);

    // an authority with another key never gets the success of the first one, even for the same seal
    const impostorTrust = new SealVerificationSession(trustBase(signer(2).publicKey), rule);
    expect((await impostorTrust.authenticate(s)).status).toEqual(VerificationStatus.FAIL);
  });

  it('bounds retained successes and evicts the oldest', async () => {
    const small = new SealVerificationSession(trustBase(node.publicKey), rule, { maxEntries: 2 });
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
      0n,
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

  it('verifies an operation against the authority as it was when the operation began', async () => {
    const tb = trustBase(node.publicKey);
    const operation = new SealVerificationSession(tb, rule);
    const identity = operation.identity;
    const s = await seal(node);
    expect((await operation.authenticate(s)).status).toEqual(VerificationStatus.OK);

    // the caller's object changes afterwards: the signer no longer resolves under that key
    const info = tb._rootNodes.get('NODE');
    tb._rootNodes.delete('NODE');
    tb._rootNodes.set('OTHER', info as NonNullable<typeof info>);

    // verdicts and memo keys of the running operation still agree with each other (the snapshot) ...
    expect(operation.identity).toEqual(identity);
    expect((await operation.authenticate(s)).status).toEqual(VerificationStatus.OK);
    expect(operation.stats).toMatchObject({ memoHits: 1, quorumChecks: 1 });

    // ... and a new operation sees the new authority, with another identity, and never inherits the old verdict
    const next = new SealVerificationSession(tb, rule);
    expect(next.identity).not.toEqual(identity);
    expect((await next.authenticate(s)).status).toEqual(VerificationStatus.FAIL);
  });

  it('binds the inner seal cache to the actual signer lookup entries too', async () => {
    const cached = new UnicitySealQuorumSignaturesVerificationRule(verifier, new VerifiedSealCache(8));
    const tb = trustBase(node.publicKey);
    const s = await seal(node);
    expect((await cached.verify(tb, s)).status).toEqual(VerificationStatus.OK);
    const info = tb._rootNodes.get('NODE');
    tb._rootNodes.delete('NODE');
    tb._rootNodes.set('OTHER', info as NonNullable<typeof info>);
    expect((await cached.verify(tb, s)).status).toEqual(VerificationStatus.FAIL);
  });

  it('bounds distinct concurrent checks', async () => {
    const capped = new SealVerificationSession(trustBase(node.publicKey), rule, { maxInFlight: 2 });
    const seals = await Promise.all([1n, 2n, 3n].map((round) => seal(node, { round })));
    const results = await Promise.allSettled(seals.map((s) => capped.authenticate(s)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    // same seal joins the running check instead of counting against the bound
    const twice = await Promise.all([capped.authenticate(seals[0]), capped.authenticate(seals[0])]);
    expect(twice.every((r) => r.status === VerificationStatus.OK)).toBe(true);
    expect(() => new SealVerificationSession(trustBase(node.publicKey), rule, { maxInFlight: 0 })).toThrow();
  });

  it('exposes an identity covering authority and policy', () => {
    const a = new SealVerificationSession(trustBase(node.publicKey), rule, { policy: 'a' });
    const b = new SealVerificationSession(trustBase(node.publicKey), rule, { policy: 'b' });
    const c = new SealVerificationSession(trustBase(signer(2).publicKey), rule, { policy: 'a' });
    expect(new Set([a.identity, b.identity, c.identity]).size).toEqual(3);
  });

  it('serves the ordinary quorum path from the same memo as the strict path, without the authority context', async () => {
    const s = await seal(node);
    expect((await session.authenticate(s)).status).toEqual(VerificationStatus.OK);
    expect((await session.verifyQuorumSignaturesOnly(s)).status).toEqual(VerificationStatus.OK);
    expect(session.stats).toMatchObject({ memoHits: 1, quorumChecks: 1 });
    // another epoch is not an authority failure for the ordinary path (original proofs may be older) but is for the strict one
    const older = await seal(node, { epoch: 7n });
    expect((await session.verifyQuorumSignaturesOnly(older)).status).toEqual(VerificationStatus.OK);
    expect((await session.authenticate(older)).status).toEqual(VerificationStatus.FAIL);
  });

  it('rejects an invalid memo size', () => {
    expect(() => new SealVerificationSession(trustBase(node.publicKey), rule, { maxEntries: 0 })).toThrow();
  });
});
