import { RootTrustBaseV2 } from '../../../../src/api/bft/trustbase/RootTrustBaseV2.js';
import { TrustBaseHistory } from '../../../../src/api/bft/trustbase/TrustBaseHistory.js';
import { UnicitySeal } from '../../../../src/api/bft/UnicitySeal.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { UnicitySealTrustBaseEntryRule } from '../../../../src/api/bft/verification/rule/UnicitySealTrustBaseEntryRule.js';
import { SealVerificationSession } from '../../../../src/api/bft/verification/SealVerificationSession.js';
import { VerifiedSealCache } from '../../../../src/api/bft/verification/VerifiedSealCache.js';
import { NetworkId } from '../../../../src/api/NetworkId.js';
import { Secp256k1SignatureVerifier } from '../../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { SigningService } from '../../../../src/crypto/secp256k1/SigningService.js';
import { HexConverter } from '../../../../src/util/HexConverter.js';
import { VerificationStatus } from '../../../../src/verification/VerificationStatus.js';
import { createTrustBaseHistoryFromAuthority, FIXTURE_EPOCH } from '../../../utils/TrustBaseHistoryFixture.js';

/** §49: a seal carries at most 256 supplied signatures, counted whoever signed, before anything is hashed, keyed or verified. */
interface IMember {
  readonly nodeId: string;
  readonly service: SigningService;
}

function members(count: number, prefix: string): IMember[] {
  return Array.from({ length: count }, (_, i) => {
    const key = new Uint8Array(32);
    new DataView(key.buffer).setUint32(28, i + 1 + (prefix === 'S' ? 10000 : 0));
    return { nodeId: `${prefix}${String(i + 1).padStart(3, '0')}`, service: new SigningService(key) };
  });
}

function historyOf(committee: readonly IMember[]): Promise<TrustBaseHistory> {
  return createTrustBaseHistoryFromAuthority({
    epoch: String(FIXTURE_EPOCH),
    epochStartRound: '0',
    networkId: NetworkId.LOCAL.id,
    quorumThreshold: String(Math.floor((committee.length * 2) / 3) + 1),
    rootNodes: committee.map((m) => ({
      nodeId: m.nodeId,
      sigKey: HexConverter.encode(m.service.publicKey),
      stake: '1',
    })),
  });
}

function sealBy(signers: readonly IMember[]): Promise<UnicitySeal> {
  return UnicitySeal.create(
    NetworkId.LOCAL,
    5n,
    FIXTURE_EPOCH,
    1700000000n,
    null,
    new Uint8Array(32).fill(0x11),
    new Map(signers.map((s) => [s.nodeId, s.service] as const)),
  );
}

function entryOf(history: TrustBaseHistory, seal: UnicitySeal): RootTrustBaseV2 {
  const placed = UnicitySealTrustBaseEntryRule.verify(history, seal);
  if (placed.entry === null) {
    throw new Error('no entry');
  }
  return placed.entry;
}

describe('the 256 supplied-signature bound of a seal', () => {
  const committee256 = members(256, 'M');
  const stranger = members(300, 'S');
  let verifier: Secp256k1SignatureVerifier;
  let verifySpy: jest.SpyInstance;
  let cache: VerifiedSealCache;
  let rule: UnicitySealQuorumSignaturesVerificationRule;

  beforeEach(() => {
    verifier = new Secp256k1SignatureVerifier();
    verifySpy = jest.spyOn(verifier, 'verify');
    cache = new VerifiedSealCache(16);
    rule = new UnicitySealQuorumSignaturesVerificationRule(verifier, cache);
  });

  it('is 256, one bound for the decoder, the rule and the session', () => {
    expect(UnicitySeal.MAX_WITNESSES).toBe(256);
  });

  it('a seal signed by all 256 members of a 256-member committee is authenticated', async () => {
    const session = new SealVerificationSession(await historyOf(committee256), rule);
    expect((await session.authenticate(await sealBy(committee256))).status).toBe(VerificationStatus.OK);
  });

  it('256 members plus one stranger make 257 signatures: refused by the session before the key, the hash or any signature', async () => {
    const session = new SealVerificationSession(await historyOf(committee256), rule);
    const over = await sealBy([...committee256, stranger[0]]);
    const encode = jest.spyOn(over, 'toCBOR');
    const result = await session.authenticate(over);
    expect(result.status).toBe(VerificationStatus.FAIL);
    expect(result.message).toMatch(/257 signatures, more than 256/);
    expect(verifySpy).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
    expect(session.stats.quorumChecks).toBe(0);
  });

  it('the quorum step alone refuses it too, with no memo lookup and no verification', async () => {
    const history = await historyOf(committee256);
    const session = new SealVerificationSession(history, rule);
    const over = await sealBy([...committee256, stranger[0]]);
    const entry = entryOf(history, await sealBy(committee256));
    const encode = jest.spyOn(over, 'toCBOR');
    const result = await session.verifyQuorum(entry, over);
    expect(result.status).toBe(VerificationStatus.FAIL);
    expect(verifySpy).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
  });

  it('the rule refuses 257 before building its cache key or verifying, whoever signed', async () => {
    const history = await historyOf(committee256);
    const entry = entryOf(history, await sealBy(committee256));
    const getSpy = jest.spyOn(cache, 'get');
    const over = await sealBy([...committee256, stranger[0]]);
    const encode = jest.spyOn(over, 'toCBOR');
    const result = await rule.verify(entry, over);
    expect(result.status).toBe(VerificationStatus.FAIL);
    expect(result.message).toMatch(/257 signatures exceed 256/);
    expect(getSpy).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('unknown signers count: 4 members and 252 strangers (256) pass, 253 strangers (257) are refused', async () => {
    const committee = members(4, 'M');
    const session = new SealVerificationSession(await historyOf(committee), rule);
    const at = await sealBy([...committee, ...stranger.slice(0, 252)]);
    expect(at.witnesses?.size).toBe(256);
    expect((await session.authenticate(at)).status).toBe(VerificationStatus.OK);
    const over = await sealBy([...committee, ...stranger.slice(0, 253)]);
    expect((await session.authenticate(over)).status).toBe(VerificationStatus.FAIL);
  });

  it('the decoder refuses 257 witnesses and accepts 256', async () => {
    const at = await sealBy(committee256);
    expect(UnicitySeal.fromCBOR(at.toCBOR()).witnesses?.size).toBe(256);
    const over = await sealBy([...committee256, stranger[0]]);
    expect(() => UnicitySeal.fromCBOR(over.toCBOR())).toThrow(Error);
    expect(() => UnicitySeal.fromCBOR(over.toCBOR())).toThrow(/257 witnesses exceed 256/);
  });
});
