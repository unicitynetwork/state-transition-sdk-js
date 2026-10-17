import { IBatchAggregatorClient, InclusionProofBatch } from '../../../src/api/IBatchAggregatorClient.js';
import { ConsolidationError } from '../../../src/consolidation/ConsolidationError.js';
import { ShardRouting } from '../../../src/consolidation/ShardRouting.js';
import { TokenProofClient } from '../../../src/consolidation/TokenProofClient.js';
import { Token } from '../../../src/transaction/Token.js';
import { IScenario, scenario } from '../../utils/ConsolidationScenario.js';
import { shardIdFromBits, WORLD_PARTITION } from '../../utils/ShardedWorld.js';

jest.setTimeout(120_000);

interface ISeen {
  readonly exact: boolean;
  readonly waitMs: number | undefined;
}

/** Routing over the in-process shards, recording every batch request, optionally reporting the negotiation retry. */
function recording(s: IScenario, seen: ISeen[], retried = false): ShardRouting {
  return new ShardRouting({
    endpoints: s.world.bits.map((bits) => {
      const real = s.world.client(bits);
      const client: IBatchAggregatorClient = {
        getInclusionProof: (id, options) => real.getInclusionProof(id, options),
        getInclusionProofs: async (ids, options) => {
          seen.push({ exact: options?.stateRoot !== undefined, waitMs: options?.waitMs });
          const batch = await real.getInclusionProofs(ids, options);
          return retried && options?.stateRoot === undefined
            ? new InclusionProofBatch(batch.proofs, batch.partitionViewBytes, { requests: 2 })
            : batch;
        },
        submitCertificationRequest: (data) => real.submitCertificationRequest(data),
      };
      return { client, shard: shardIdFromBits(bits) };
    }),
    partitionId: WORLD_PARTITION,
    scheme: s.world.scheme,
  });
}

async function multiShardToken(s: IScenario): Promise<Token> {
  const shards = (t: Token): number =>
    new Set(
      [t.genesis, ...t.transactions].map((x) =>
        x.inclusionProof.unicityCertificate.shardTreeCertificate.shard.toString(),
      ),
    ).size;
  let token = await s.history(8);
  for (let attempt = 0; attempt < 8 && shards(token) < 2; attempt++) {
    token = await s.history(8);
  }
  return token;
}

describe('consolidation masterLongPoll', () => {
  it('sends no wait unless enabled', async () => {
    const s = await scenario(2);
    const token = await multiShardToken(s);
    const seen: ISeen[] = [];
    await new TokenProofClient({ routing: recording(s, seen), verificationContext: s.context }).consolidate(token);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((r) => r.waitMs === undefined)).toBe(true);
  });

  it('waits on the master latest request only, never on an exact root peer', async () => {
    const s = await scenario(2);
    const token = await multiShardToken(s);
    const seen: ISeen[] = [];
    const result = await new TokenProofClient({
      routing: recording(s, seen),
      verificationContext: s.context,
    }).consolidate(token, { masterLongPoll: { windowMs: 3000 } });
    expect(result.status).toBe('consolidated');
    const masters = seen.filter((r) => !r.exact);
    expect(masters).toHaveLength(1);
    expect(masters[0].waitMs).toBeGreaterThan(0);
    expect(masters[0].waitMs).toBeLessThanOrEqual(3000);
    const peers = seen.filter((r) => r.exact);
    expect(peers.length).toBeGreaterThan(0);
    expect(peers.every((r) => r.waitMs === undefined)).toBe(true);
    // one request per participating shard: no polling
    expect(seen).toHaveLength(masters.length + peers.length);
  });

  it('true asks for the preferred window clamped to the deadline less the margin; nothing fitting drops it', async () => {
    const s = await scenario(0);
    const token = await s.history(3);
    const seen: ISeen[] = [];
    const client = new TokenProofClient({ routing: recording(s, seen), verificationContext: s.context });
    await client.consolidate(token, { masterLongPoll: true, timeoutMs: 5000 });
    expect(seen[0].waitMs).toBeLessThanOrEqual(3000);
    expect(seen[0].waitMs).toBeGreaterThan(2000);

    seen.length = 0;
    await client.consolidate(token, { masterLongPoll: true, timeoutMs: 1500 });
    expect(seen[0].waitMs).toBeUndefined();
  });

  it('the margin is configurable', async () => {
    const s = await scenario(0);
    const token = await s.history(3);
    const seen: ISeen[] = [];
    const client = new TokenProofClient({ routing: recording(s, seen), verificationContext: s.context });
    await client.consolidate(token, { masterLongPoll: { marginMs: 500 }, timeoutMs: 5000 });
    expect(seen[0].waitMs).toBeGreaterThan(3500);
    expect(seen[0].waitMs).toBeLessThanOrEqual(4500);
  });

  it('false and a zero window send nothing, so no negotiation cost', async () => {
    const s = await scenario(0);
    const token = await s.history(3);
    for (const masterLongPoll of [false, { windowMs: 0 }]) {
      const seen: ISeen[] = [];
      await new TokenProofClient({ routing: recording(s, seen, true), verificationContext: s.context }).consolidate(
        token,
        { masterLongPoll },
      );
      expect(seen.every((r) => r.waitMs === undefined)).toBe(true);
    }
  });

  it('counts the negotiation retry as a request', async () => {
    const s = await scenario(0);
    const token = await s.history(3);
    const plain = await new TokenProofClient({ routing: recording(s, []), verificationContext: s.context }).consolidate(
      token,
    );
    const retried = await new TokenProofClient({
      routing: recording(s, [], true),
      verificationContext: s.context,
    }).consolidate(token, { masterLongPoll: { windowMs: 1000 } });
    if (plain.status === 'consolidated' && retried.status === 'consolidated') {
      expect(retried.summary.requests).toBe(plain.summary.requests + 1);
    } else {
      throw new Error('expected both attempts to consolidate');
    }
  });

  it.each([{ windowMs: -1 }, { windowMs: NaN }, { marginMs: -1 }, { windowMs: Number.MAX_SAFE_INTEGER + 1 }])(
    'rejects masterLongPoll %j as input',
    async (masterLongPoll) => {
      const s = await scenario(0);
      const token = await s.history(3);
      const seen: ISeen[] = [];
      const error = await new TokenProofClient({ routing: recording(s, seen), verificationContext: s.context })
        .consolidate(token, { masterLongPoll })
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(ConsolidationError);
      expect((error as ConsolidationError).kind).toBe('input');
      expect(seen).toHaveLength(0);
    },
  );
});
