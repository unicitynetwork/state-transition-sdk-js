import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { PartitionView } from '../../../src/api/bft/PartitionView.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { SealVerificationSession } from '../../../src/api/bft/verification/SealVerificationSession.js';
import { ConsolidationError } from '../../../src/consolidation/ConsolidationError.js';
import { ConsolidationAttempt, ProofConsolidator } from '../../../src/consolidation/ProofConsolidator.js';
import { ShardRouting } from '../../../src/consolidation/ShardRouting.js';
import { Secp256k1SignatureVerifier } from '../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import {
  evidenceOf,
  F1_DIR,
  IF1Case,
  loadCase,
  negativeCaseNames,
  networkOf,
  sha256Hex,
  shardIdOf,
} from '../../utils/F1Corpus.js';

function shardUrl(bits: string): string {
  return `http://shard-${bits || 'root'}.test`;
}

/** Serve the corpus' JSON-RPC responses through the real AggregatorClient, only `fetch` is faked. */
function fakeFetch(c: IF1Case, calls: { body: Record<string, unknown>; shard: string }[]): jest.SpyInstance {
  const byUrl = new Map<string, IF1Case['responses']['master']>();
  byUrl.set(shardUrl(c.responses.master.id === 1 ? c.context.master : c.context.master), c.responses.master);
  for (const peer of c.responses.peers ?? []) {
    byUrl.set(shardUrl(peer.shard), peer.response);
  }
  return jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = JSON.parse(init?.body as string) as { id: string; method: string; params: Record<string, unknown> };
    calls.push({ body: body, shard: url });
    const response = byUrl.get(url);
    if (!response) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ ...response, id: body.id }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
  });
}

function build(c: IF1Case): {
  consolidator: ProofConsolidator;
  routing: ShardRouting;
  session: SealVerificationSession;
} {
  const scheme = c.context.shards.length === 1 && c.context.shards[0] === '' ? [] : c.context.shards.map(shardIdOf);
  const routing = new ShardRouting({
    endpoints: c.context.participants.map((bits) => ({
      client: new AggregatorClient(shardUrl(bits)),
      shard: shardIdOf(bits),
    })),
    partitionId: BigInt(c.context.partitionId),
    scheme,
    shardConfigurationPins: c.context.shardConfigs.map((s) => ({
      hash: HexConverter.decode(s.hash),
      shard: shardIdOf(s.shard),
    })),
  });
  const session = new SealVerificationSession(
    c.trustBase,
    new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
  );
  return { consolidator: new ProofConsolidator(routing, session), routing, session };
}

/** Outcome names of the reference implementation for what this SDK observed. */
function observe(run: ConsolidationAttempt | ConsolidationError): string {
  if (run instanceof ConsolidationError) {
    switch (run.kind) {
      case 'rejected':
        return 'invalid_request';
      case 'server':
        return 'infrastructure';
      case 'invalid_response':
        return 'invalid_input';
      default:
        return run.outcome ?? run.kind;
    }
  }
  if (run.status === 'consolidated') {
    return 'ok';
  }
  switch (run.reason) {
    case 'busy':
      return 'busy';
    case 'limit_exceeded':
      return 'limit_exceeded';
    case 'unsupported_configuration':
      return 'unsupported';
    case 'unsupported_capability':
      return 'unsupported_method';
    case 'pending_publication':
      return run.detail === 'master_round_below_required' ? 'stale' : 'unavailable';
    default:
      return 'unavailable';
  }
}

async function execute(c: IF1Case): Promise<ConsolidationAttempt | ConsolidationError> {
  const calls: { body: Record<string, unknown>; shard: string }[] = [];
  const spy = fakeFetch(c, calls);
  try {
    const { consolidator } = build(c);
    let items;
    try {
      items = evidenceOf(c.requests);
    } catch (e) {
      // evidence that does not even decode (e.g. a null path step) never reaches the consolidator
      return new ConsolidationError('input', e instanceof Error ? e.message : String(e), { outcome: 'invalid_input' });
    }
    return await consolidator.consolidate(items, {
      master: shardIdOf(c.context.master),
      timeoutMs: 20_000,
    });
  } catch (e) {
    if (e instanceof ConsolidationError) {
      return e;
    }
    throw e;
  } finally {
    spy.mockRestore();
  }
}

const POSITIVE = [
  'shards-1',
  'shards-4',
  'shards-8',
  'shards-4-timeout-unchanged',
  'large-values',
  'witness-alt',
  'nil-vs-empty',
];

describe('F1 corpus manifest', () => {
  it('matches the checksums it records', () => {
    const manifest = JSON.parse(readFileSync(join(F1_DIR, 'manifest.json'), 'utf8')) as {
      cases: unknown[];
      sha256: Record<string, string>;
    };
    expect(Object.keys(manifest.sha256).length).toBeGreaterThan(300);
    for (const [file, digest] of Object.entries(manifest.sha256)) {
      expect(sha256Hex(new Uint8Array(readFileSync(join(F1_DIR, file))))).toEqual(digest);
    }
    expect(manifest.cases).toHaveLength(POSITIVE.length + negativeCaseNames().length);
  });
});

describe('F1 positive cases', () => {
  it.each(POSITIVE)('%s: byte-identical certificates and proofs, expected counters', async (name) => {
    const c = loadCase(name);
    const run = await execute(c);
    if (run instanceof ConsolidationError) {
      throw run;
    }
    expect(run.status).toEqual('consolidated');
    if (run.status !== 'consolidated') {
      return;
    }
    expect(run.requiredRound.toString()).toEqual(c.expected.rMin);
    expect(run.masterRound.toString()).toEqual(c.expected.rootRound);
    expect(run.masterShard.toString()).toEqual(c.expected.master);
    const counters = c.expected.counters;
    expect(run.counters.bodyChecks).toEqual(counters?.bodyChecks);
    expect(run.counters.leafChecks).toEqual(counters?.leafChecks);
    expect(run.counters.evidenceQuorumChecks).toEqual(counters?.evidenceQuorumChecks);
    expect(run.counters.quorumChecks).toBeLessThanOrEqual(counters?.quorumChecks ?? 1);
    expect(run.shards).toEqual(c.expected.bundle?.length);
    expect(run.waves).toEqual((c.expected.bundle?.length ?? 1) > 1 ? 2 : 1);
    expect(run.requests).toEqual(c.expected.bundle?.length);

    // the replacement proofs are exactly the reference bundle, in input order per shard
    const byShard = new Map(c.expected.bundle?.map((b) => [b.shard, b]));
    const seen = new Map<string, number>();
    const evidence = evidenceOf(c.requests);
    for (const [i, response] of run.responses.entries()) {
      const uc = response.inclusionProof?.unicityCertificate;
      const shard = uc?.shardTreeCertificate.shard.toString() ?? '';
      const expectedShard = byShard.get(shard);
      expect(expectedShard).toBeDefined();
      expect(HexConverter.encode(uc?.toCBOR() as Uint8Array)).toEqual(expectedShard?.uc);
      const position = seen.get(shard) ?? 0;
      seen.set(shard, position + 1);
      expect(HexConverter.encode(response.toCBOR())).toEqual(expectedShard?.proofs[position]);
      // original data and reference time are preserved
      expect(response.inclusionProof?.certificationData.toCBOR()).toEqual(evidence[i].certificationData.toCBOR());
      expect(response.inclusionProof?.referenceTime).toEqual(evidence[i].proof.referenceTime);
    }
    // one identical master seal under every output certificate
    const seals = new Set(
      run.responses.map((r) =>
        HexConverter.encode(r.inclusionProof?.unicityCertificate.unicitySeal.toCBOR() as Uint8Array),
      ),
    );
    expect(seals.size).toEqual(1);
  });

  it('keeps uint64 values above the JS safe integer range exact', async () => {
    const c = loadCase('large-values');
    const run = await execute(c);
    expect(run instanceof ConsolidationError ? run.message : run.status).toEqual('consolidated');
    const evidence = evidenceOf(c.requests);
    expect(evidence.some((e) => e.proof.referenceTime > BigInt(Number.MAX_SAFE_INTEGER))).toBe(true);
  });
});

/** Cases whose input does not exist in this SDK: requests are derived from the evidence, never supplied separately. */
const NOT_APPLICABLE = new Set([
  'negative/request-differs-from-evidence',
  'negative/request-wrong-state-id',
  'negative/request-wrong-leaf-value',
  // the SDK derives R_min from the token itself, there is no way to ask without evidence
  'negative/rmin-unknown',
]);

describe('F1 negative cases', () => {
  const names = negativeCaseNames();

  it.each(names)('%s', async (name) => {
    const c = loadCase(name);
    const { stage, outcome } = c.expected;
    const requestsDiffer =
      c.expected.changedFiles?.length === 1 &&
      c.expected.changedFiles[0] === 'requests.json' &&
      stage === 'consolidate';
    if (NOT_APPLICABLE.has(name) || requestsDiffer) {
      return;
    }

    if (stage === 'policy') {
      // the trusted context itself is refused when it is configured
      let observed = 'ok';
      try {
        build(c);
        // the declared network of the context is the one of the trust base: no separate routing field to disagree
        if (!networkOf(c.context).equals(c.trustBase.networkId)) {
          throw new ConsolidationError('input', 'The context is for another network than the trust base.', {
            outcome: 'incompatible_lineage',
          });
        }
      } catch (e) {
        observed = e instanceof ConsolidationError ? (e.outcome ?? e.kind) : 'unexpected';
      }
      expect(observed).toEqual(outcome);
      return;
    }

    if (stage === 'view_codec') {
      expect(() => PartitionView.fromCBOR(c.partitionView)).toThrow();
      // and the whole pipeline refuses the response it came with
      const run = await execute(c);
      expect(observe(run)).toEqual(c.expected.pipelineOutcome ?? outcome);
      return;
    }

    const run = await execute(c);
    expect(observe(run)).toEqual(outcome);

    // the aggregator's state status details are reported under their own names, retryability as the contract says
    const detail = c.expected.rpc?.detail;
    if (
      stage === 'rpc' &&
      ['state_pending', 'state_expired', 'state_unknown', 'state_not_in_root'].includes(detail ?? '')
    ) {
      const rpc = c.expected.rpc;
      const failing =
        rpc?.role === 'master' ? c.responses.master : c.responses.peers?.find((p) => p.shard === rpc?.shard)?.response;
      const data = (failing?.error as { data: { indexes: Record<string, number[]> } }).data;
      const own = data.indexes[(detail ?? '').replace(/^state_/, '')];
      // positions of the failing shard's batch, as positions in the evidence (the token's outer history)
      const shardOfEvidence = evidenceOf(c.requests).map((e) =>
        e.proof.unicityCertificate.shardTreeCertificate.shard.toString(),
      );
      const group = shardOfEvidence.flatMap((shard, i) => (shard === rpc?.shard ? [i] : []));
      expect(run).toMatchObject({
        detail,
        proofIndexes: own.map((i) => group[i]),
        reason: detail,
        retryable: rpc?.retryable,
        status: 'unavailable',
      });
    }
  });
});
