import { ShardRouting } from '../../../src/consolidation/ShardRouting.js';
import { TokenProofClient } from '../../../src/consolidation/TokenProofClient.js';
import { snapshotPartitionViewMetrics } from '../../../src/internal/bft/PartitionViewMetrics.js';
import { Token } from '../../../src/transaction/Token.js';
import { scenario } from '../../utils/ConsolidationScenario.js';
import { shardIdFromBits, WORLD_PARTITION } from '../../utils/ShardedWorld.js';

jest.setTimeout(180_000);

function shardsOf(token: Token): number {
  return new Set(
    [token.genesis, ...token.transactions].map((t) =>
      t.inclusionProof.unicityCertificate.shardTreeCertificate.shard.toString(),
    ),
  ).size;
}

describe('consolidation view work', () => {
  it('decodes the view once (S leaves) and then one leaf per participating shard and per certificate', async () => {
    const S = 8;
    const rows: { decodes: number; m: number }[] = [];
    for (const transfers of [3, 8, 16]) {
      const s = await scenario(3);
      const token = await s.history(transfers);
      const routing = new ShardRouting({
        endpoints: s.world.bits.map((b) => ({ client: s.world.client(b), shard: shardIdFromBits(b) })),
        partitionId: WORLD_PARTITION,
        scheme: s.world.scheme,
      });
      const before = snapshotPartitionViewMetrics();
      const result = await new TokenProofClient({ routing, verificationContext: s.context }).consolidate(token);
      const after = snapshotPartitionViewMetrics();
      expect(result.status).toEqual('consolidated');
      rows.push({ decodes: after.leafDecodes - before.leafDecodes, m: shardsOf(token) });
      // never a whole view per participating shard
      expect(after.viewDecodes - before.viewDecodes).toBeLessThanOrEqual(2);
    }
    for (const { decodes, m } of rows) {
      // S leaves to authenticate, (m - 1) peer root lookups, m certificate derivations: O(S + m), not O(m S)
      expect(decodes).toBeLessThanOrEqual(S * 2 + 2 * m);
      expect(decodes).toBeGreaterThanOrEqual(S);
    }
    expect(Math.max(...rows.map((r) => r.m))).toBeGreaterThan(3);
  });
});
