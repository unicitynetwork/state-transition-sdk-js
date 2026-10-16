import { PartitionViewAuthenticator } from '../../../src/api/bft/AuthenticatedPartitionView.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { SealVerificationSession } from '../../../src/api/bft/verification/SealVerificationSession.js';
import { Secp256k1SignatureVerifier } from '../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { snapshotPartitionViewMetrics } from '../../../src/internal/bft/PartitionViewMetrics.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { schemeOf, ShardedWorld, shardIdFromBits, WORLD_PARTITION } from '../../utils/ShardedWorld.js';

jest.setTimeout(120_000);

async function authenticated(shardBits: number): Promise<{
  view: Awaited<ReturnType<PartitionViewAuthenticator['authenticate']>>;
  world: ShardedWorld;
}> {
  const world = await ShardedWorld.create(shardBits);
  await world.idle(1);
  const round = world.latest;
  const master = round.ucs.get(schemeOf(shardBits)[0]);
  if (!master) {
    throw new Error('no master certificate');
  }
  const session = new SealVerificationSession(
    world.trustBase,
    new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
  );
  const view = await new PartitionViewAuthenticator(WORLD_PARTITION, session).authenticate(round.view.toCBOR(), master);
  return { view, world };
}

describe.each([0, 1, 2, 3])('authenticated view of %i shard bits', (bits) => {
  const shards = 1 << bits;

  it('derives nothing at authentication, one certificate per lookup, whatever the number of shards', async () => {
    const before = snapshotPartitionViewMetrics();
    const { view } = await authenticated(bits);
    const afterAuth = snapshotPartitionViewMetrics();

    // authentication needs the whole view (O(S)) but derives no certificate: that is lazy
    expect(afterAuth.certificateDerivations - before.certificateDerivations).toEqual(0);

    const ids = schemeOf(bits);
    for (const lookups of [1, 2, 4, 8, 16, 32, 64]) {
      const start = snapshotPartitionViewMetrics();
      for (let i = 0; i < lookups; i++) {
        view.certificateOf(shardIdFromBits(ids[i % ids.length]));
      }
      const end = snapshotPartitionViewMetrics();
      // m lookups cost exactly m leaf decodes and m derivations, and no view is ever decoded again
      expect(end.leafDecodes - start.leafDecodes).toEqual(lookups);
      expect(end.certificateDerivations - start.certificateDerivations).toEqual(lookups);
      expect(end.viewDecodes - start.viewDecodes).toEqual(0);
    }
  });

  it('derives all shards only when all are asked for, in canonical order', async () => {
    const { view, world } = await authenticated(bits);
    const start = snapshotPartitionViewMetrics();
    const all = view.assembleCertificates();
    const end = snapshotPartitionViewMetrics();
    expect(all).toHaveLength(shards);
    expect(end.certificateDerivations - start.certificateDerivations).toEqual(shards);
    expect(end.leafDecodes - start.leafDecodes).toEqual(shards);
    expect(end.viewDecodes - start.viewDecodes).toEqual(0);
    // lazy per-shard derivation equals the eager one, byte for byte
    for (const [i, id] of schemeOf(bits).entries()) {
      expect(HexConverter.encode(view.certificateOf(shardIdFromBits(id)).toCBOR())).toEqual(
        HexConverter.encode(all[i].toCBOR()),
      );
      expect(HexConverter.encode(all[i].toCBOR())).toEqual(
        HexConverter.encode((world.latest.ucs.get(id) as { toCBOR(): Uint8Array }).toCBOR()),
      );
    }
  });

  it('finds a leaf through the index: one decode per lookup, and a copy', async () => {
    const { view } = await authenticated(bits);
    const ids = schemeOf(bits);
    for (const lookups of [1, 4, 16]) {
      const start = snapshotPartitionViewMetrics();
      for (let i = 0; i < lookups; i++) {
        const leaf = view.leafOf(shardIdFromBits(ids[i % ids.length]));
        expect(leaf.shardId.toString()).toEqual(ids[i % ids.length]);
      }
      const end = snapshotPartitionViewMetrics();
      expect(end.leafDecodes - start.leafDecodes).toEqual(lookups);
      expect(end.viewDecodes - start.viewDecodes).toEqual(0);
    }
    expect(() => view.leafOf(shardIdFromBits('1'.repeat(40)))).toThrow('not in the authenticated view');
  });

  it('keeps the immutable boundary: every lookup is an independent copy', async () => {
    const { view } = await authenticated(bits);
    const id = shardIdFromBits(schemeOf(bits)[0]);
    const first = view.certificateOf(id);
    (first.inputRecord as unknown as { timestamp: bigint }).timestamp = 1n;
    (first.unicitySeal as unknown as { _hash: Uint8Array })._hash.fill(0);
    expect(view.certificateOf(id).inputRecord.timestamp).not.toEqual(1n);
    expect(view.certificateOf(id).toCBOR()).not.toEqual(first.toCBOR());
    expect(() => view.certificateOf(shardIdFromBits('1'.repeat(40)))).toThrow('not in the authenticated view');
  });
});
