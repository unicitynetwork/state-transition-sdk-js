import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { ShardId } from '../../../src/api/bft/ShardId.js';
import { UnicitySealQuorumSignaturesVerificationRule } from '../../../src/api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js';
import { UnicityCertificateVerifier } from '../../../src/api/bft/verification/UnicityCertificateVerifier.js';
import { VerifiedSealCache } from '../../../src/api/bft/verification/VerifiedSealCache.js';
import { NonInclusionCertificate } from '../../../src/api/NonInclusionCertificate.js';
import { NonInclusionProof } from '../../../src/api/NonInclusionProof.js';
import {
  NonInclusionSnapshot,
  NonInclusionVerification,
  verifyNonInclusion,
} from '../../../src/api/NonInclusionVerification.js';
import { StateId } from '../../../src/api/StateId.js';
import { Secp256k1SignatureVerifier } from '../../../src/crypto/secp256k1/Secp256k1SignatureVerifier.js';
import { CborSerializer } from '../../../src/serialization/cbor/CborSerializer.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { loadAuthorityHistory } from '../../utils/TrustBaseHistoryFixture.js';

/** Corpus aggregator-go `testdata/non-inclusion/v2`, vendored byte for byte, see PROVENANCE.md. */
const ROOT = join(process.cwd(), 'tests/fixtures/non-inclusion/v2');

interface ISnapshotJson {
  readonly networkId: number;
  readonly partitionId: number;
  readonly rootEpoch: string;
  readonly rootRound: string;
  readonly sealTimestampSeconds: string;
  readonly shardEpoch: string;
  readonly shardId: string;
  readonly shardRound: string;
  readonly stateRoot: string | null;
}

interface IExpected {
  readonly acceptable?: string[];
  readonly outcome: string;
  readonly rejection?: string;
  readonly snapshot?: ISnapshotJson;
  readonly stateId?: string;
}

interface ICase {
  readonly block: string;
  readonly certificate: string;
  readonly context: string;
  readonly expected: IExpected;
  readonly name: string;
  readonly query: string;
  readonly root: string;
  readonly uc: string;
  readonly wrapper: string;
}

interface IContext {
  readonly nextEpochStart: string;
  readonly shard: string;
  readonly shardConfHash: string;
  readonly trustBaseJson: string;
}

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const json = <T>(path: string): T => JSON.parse(read(path)) as T;
const contexts = json<Record<string, IContext>>('contexts.json');
const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => `${dir}/${f}`);

function stateIdOf(hex: string): StateId {
  return StateId.fromCBOR(CborSerializer.encodeByteString(HexConverter.decode(hex)));
}

/** The snapshot of a result in the JSON vocabulary of the corpus (uint64 as decimal strings, bytes as hex). */
function snapshotJson(snapshot: NonInclusionSnapshot): ISnapshotJson {
  return {
    networkId: snapshot.networkId,
    partitionId: Number(snapshot.partitionId),
    rootEpoch: snapshot.rootEpoch.toString(),
    rootRound: snapshot.rootRound.toString(),
    sealTimestampSeconds: snapshot.sealTimestampSeconds.toString(),
    shardEpoch: snapshot.shardEpoch.toString(),
    shardId: snapshot.shardId.toString(),
    shardRound: snapshot.shardRound.toString(),
    stateRoot: snapshot.stateRoot === null ? null : HexConverter.encode(snapshot.stateRoot),
  };
}

type Outcome =
  | { readonly outcome: 'malformed' }
  | { readonly outcome: NonInclusionVerification['verdict']; readonly result: NonInclusionVerification };

/** What this SDK does with a wrapper, on one verifier like a real application would. */
async function run(
  c: Pick<ICase, 'context' | 'query' | 'wrapper'>,
  verifier: UnicityCertificateVerifier = new UnicityCertificateVerifier(
    new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
  ),
  contextName: string = c.context,
): Promise<Outcome> {
  const context = contexts[contextName];
  let proof: NonInclusionProof;
  try {
    proof = NonInclusionProof.decode(stateIdOf(c.query), HexConverter.decode(c.wrapper));
  } catch {
    return { outcome: 'malformed' };
  }
  // the corpus writes uint64 values of the authority as JSON numbers: quote them before parsing, a double would round
  const trustBase = await loadAuthorityHistory(join(ROOT, context.trustBaseJson));
  const result = await verifyNonInclusion(
    proof,
    { trustBase, unicityCertificateVerifier: verifier },
    {
      ...(BigInt(context.nextEpochStart) > 0n ? { nextEpochStartRound: BigInt(context.nextEpochStart) } : {}),
      ...(context.shard !== '' ? { shard: ShardId.fromBits(context.shard) } : {}),
      ...(context.shardConfHash ? { shardConfigurationHash: HexConverter.decode(context.shardConfHash) } : {}),
    },
  );
  return { outcome: result.verdict, result };
}

/** Assert one outcome against the expectation of the corpus: exact for successes, class and no metadata for a rejection. */
function expectOutcome(actual: Outcome, expected: IExpected): void {
  if (expected.outcome === 'absent_at_snapshot' || expected.outcome === 'included_at_snapshot') {
    expect(actual.outcome).toEqual(expected.outcome);
    const { result } = actual as { result: NonInclusionVerification };
    expect(result.snapshot).not.toBeNull();
    expect(result.stateId.data).toEqual(HexConverter.decode(expected.stateId as string));
    expect(snapshotJson(result.snapshot as NonInclusionSnapshot)).toEqual(expected.snapshot);
    return;
  }
  expect(expected.outcome).toEqual('rejected');
  // never a success, never metadata of a snapshot
  expect(actual.outcome).not.toEqual('absent_at_snapshot');
  expect(actual.outcome).not.toEqual('included_at_snapshot');
  if ('result' in actual) {
    expect(actual.result.snapshot).toBeNull();
  }
  // SPEC "Conformance": the class is `expected.rejection` or one of `expected.acceptable` (a strict decoder may stop at an
  // earlier stage, `malformed`, only where the case lists it); never loosened to reach a later class
  expect([expected.rejection, ...(expected.acceptable ?? [])]).toContain(actual.outcome);
}

describe('non-inclusion corpus v2', () => {
  it('is the vendored corpus, unchanged (the manifest itself is pinned too, see PROVENANCE.md)', () => {
    expect(
      createHash('sha256')
        .update(readFileSync(join(ROOT, 'manifest.json')))
        .digest('hex'),
    ).toEqual('7bfb40a209b137acdcfa3deea0834a54924ce32e7d9d41c0d9d583ae3dc5dd8b');
    const manifest = json<{ sha256: Record<string, string> }>('manifest.json');
    for (const [path, sha] of Object.entries(manifest.sha256)) {
      expect(
        createHash('sha256')
          .update(readFileSync(join(ROOT, path)))
          .digest('hex'),
      ).toEqual(sha);
    }
  });

  describe('positive cases: every snapshot field', () => {
    it.each(files('cases'))('%s', async (path) => {
      const c = json<ICase>(path);
      expectOutcome(await run(c), c.expected);
      if (c.certificate.length > 0 || c.root === '') {
        // the codec reproduces the bytes of the producers
        const bytes = HexConverter.decode(c.certificate);
        expect(NonInclusionCertificate.fromBytes(bytes).toBytes()).toEqual(bytes);
      }
      const wrapper = HexConverter.decode(c.wrapper);
      expect(NonInclusionProof.decode(stateIdOf(c.query), wrapper).toCBOR()).toEqual(wrapper);
    });
  });

  describe('negative cases never loosen a decoder to reach a later class, and carry no metadata', () => {
    it.each(files('negative'))('%s', async (path) => {
      const c = json<ICase>(path);
      expectOutcome(await run(c), c.expected);
    });
  });

  describe('caller policy examples are applied after verification', () => {
    interface IPolicyExample {
      readonly checkpoint: { minSealTimestampSeconds?: string; networkId: number; requiredRootRound: string };
      readonly decision: 'accept' | 'reject';
      readonly name: string;
      readonly snapshot: ISnapshotJson;
      readonly vector: string;
    }
    const decide = (snapshot: NonInclusionSnapshot, checkpoint: IPolicyExample['checkpoint']): 'accept' | 'reject' =>
      snapshot.networkId === checkpoint.networkId &&
      snapshot.rootRound >= BigInt(checkpoint.requiredRootRound) &&
      (checkpoint.minSealTimestampSeconds === undefined ||
        snapshot.sealTimestampSeconds >= BigInt(checkpoint.minSealTimestampSeconds))
        ? 'accept'
        : 'reject';

    it.each(json<{ examples: IPolicyExample[] }>('policy.json').examples.map((e) => [e.name, e] as const))(
      '%s',
      async (_name, example) => {
        const c = json<ICase>(`${example.vector}.json`);
        const actual = await run(c);
        expectOutcome(actual, c.expected);
        const { snapshot } = (actual as { result: NonInclusionVerification }).result;
        expect(snapshotJson(snapshot as NonInclusionSnapshot)).toEqual(example.snapshot);
        expect(decide(snapshot as NonInclusionSnapshot, example.checkpoint)).toEqual(example.decision);
      },
    );
  });

  describe('sequences on one verifier', () => {
    interface ISequence {
      readonly context: string;
      readonly name: string;
      readonly steps: { readonly expected: IExpected; readonly vector: string }[];
    }
    it.each(json<{ sequences: ISequence[] }>('sequences.json').sequences.map((q) => [q.name, q] as const))(
      '%s',
      async (_name, sequence) => {
        // one operation scoped verifier: authenticated seals are shared by the steps
        const verifier = new UnicityCertificateVerifier(
          new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier(), new VerifiedSealCache(16)),
        ).beginOperation();
        for (const step of sequence.steps) {
          const c = json<ICase>(`${step.vector}.json`);
          expectOutcome(await run(c, verifier, sequence.context), step.expected);
        }
      },
    );
  });

  describe('mutation resistance: one changed byte is never a different outcome or snapshot', () => {
    it.each(['cases/golden-two-leaf.json', 'cases/sharded-absent.json', 'cases/empty-tree.json'])(
      '%s',
      async (path) => {
        const c = json<ICase>(path);
        const original = (await run(c)) as { outcome: string; result: NonInclusionVerification };
        const wrapper = HexConverter.decode(c.wrapper);
        const verifier = new UnicityCertificateVerifier(
          new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier(), new VerifiedSealCache(64)),
        ).beginOperation();
        let accepted = 0;
        for (let i = 0; i < wrapper.length; i++) {
          const mutated = new Uint8Array(wrapper);
          mutated[i] ^= 0x01;
          const outcome = await run({ ...c, wrapper: HexConverter.encode(mutated) }, verifier);
          if ('result' in outcome && outcome.result.snapshot !== null) {
            // the byte did not matter (the unauthenticated block number): everything authenticated is the same
            accepted++;
            expect(outcome.outcome).toEqual(original.outcome);
            expect(snapshotJson(outcome.result.snapshot)).toEqual(
              snapshotJson(original.result.snapshot as NonInclusionSnapshot),
            );
          } else if ('result' in outcome) {
            expect(outcome.result.snapshot).toBeNull();
          }
        }
        // only the few bytes of the unauthenticated block number may change without a rejection
        expect(accepted).toBeLessThanOrEqual(9);
      },
      120000,
    );
  });

  it('keeps a result independent of the evidence it was built from', async () => {
    const c = json<ICase>('cases/golden-two-leaf.json');
    const outcome = (await run(c)) as { result: NonInclusionVerification };
    const snapshot = outcome.result.snapshot as NonInclusionSnapshot;
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(outcome.result)).toBe(true);
    const root = snapshot.stateRoot as Uint8Array;
    root.fill(0);
    expect(snapshot.stateRoot).not.toEqual(root);
    const shard = snapshot.shardId;
    expect(shard).not.toBe(snapshot.shardId);
    expect(() => {
      (snapshot as unknown as { rootRound: bigint }).rootRound = 0n;
    }).toThrow(TypeError);
  });
});

interface IRpcCase {
  readonly body: string;
  readonly expected: string;
  readonly httpStatus: number;
  readonly name: string;
  readonly requestId: number;
}

/** The shared table of how a client classifies an answer, mapped to this SDK's vocabulary. */
const RPC_KINDS: Record<string, string[]> = {
  busy: ['busy'],
  internal: ['server'],
  invalid_params: ['rejected'],
  method_not_found: ['rejected'],
  state_included: ['state_included_hint'],
  // not a complete matching envelope: never evidence, either a transport failure or an invalid response
  transport_error: ['transport', 'invalid_response'],
  unavailable: ['unavailable'],
};

describe('non-inclusion rpc-errors corpus', () => {
  afterEach(() => jest.restoreAllMocks());
  const cases = json<{ cases: IRpcCase[] }>('rpc-errors.json').cases;

  it.each(cases.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const id = (JSON.parse(init?.body as string) as { id: string }).id;
      // the table names the request id 7; ids other than 7 stay different from the real one
      return Promise.resolve(
        new Response(c.body.replace(`"id":${c.requestId}`, `"id":${JSON.stringify(id)}`), { status: c.httpStatus }),
      );
    });
    const answer = await new AggregatorClient('https://example.com')
      .getNonInclusionProof(stateIdOf('00'.repeat(32)))
      .then(
        (r) => ({ kind: r.kind }),
        (e: unknown) => ({ code: (e as { code?: number }).code, kind: (e as { kind: string }).kind }),
      );
    if (c.expected === 'result') {
      // the string is decoded by the wrapper rules: "00" is no wrapper
      expect(answer.kind).toEqual('invalid_response');
    } else if (c.expected.startsWith('rpc_error:')) {
      expect(answer).toEqual({ code: Number(c.expected.slice('rpc_error:'.length)), kind: 'server' });
    } else {
      expect(RPC_KINDS[c.expected]).toContain(answer.kind);
    }
  });
});
