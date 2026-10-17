import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { BatchProofError } from '../../../src/api/BatchProofError.js';
import { JsonRpcDataError } from '../../../src/api/json-rpc/JsonRpcDataError.js';
import { JsonRpcResponseError } from '../../../src/api/json-rpc/JsonRpcResponseError.js';
import { StateId } from '../../../src/api/StateId.js';
import { DataHash } from '../../../src/crypto/hash/DataHash.js';
import { HashAlgorithm } from '../../../src/crypto/hash/HashAlgorithm.js';
import { isWireMilliseconds } from '../../../src/internal/longPoll.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { ShardedWorld } from '../../utils/ShardedWorld.js';

/**
 * The A0 wire fixtures of aggregator-go (`testdata/longpoll/`, PR 225), copied byte for byte from the commit recorded in
 * `tests/fixtures/longpoll/SOURCE`. They are copies of a branch under review: re-copy from the merged A0. Source of truth:
 * the Go server; do not edit these files here.
 */
const DIR = join(__dirname, '../../fixtures/longpoll');
const read = (name: string): string => readFileSync(join(DIR, name), 'utf8');
const json = <T>(name: string): T => JSON.parse(read(name)) as T;

interface IParamsCase {
  readonly method: string;
  readonly name: string;
  readonly params: string;
  readonly valid: boolean;
  readonly waitMs?: number | null;
}
interface IEchoCase {
  readonly name: string;
  readonly request: { method: string; params: { includeStatus?: boolean; stateIds?: string[]; waitMs?: number } };
  readonly response: { error?: { code: number; data?: unknown; message: string }; result?: unknown };
}
interface ICapabilityCase {
  readonly action: string;
  readonly first?: unknown;
  readonly name: string;
  readonly response?: { error?: { code: number; data?: unknown; message: string }; result?: unknown } | string;
  readonly second?: { error: { code: number; data?: unknown; message: string } };
}

const ID = HexConverter.encode(new Uint8Array(32).fill(0xab));
const stateId = StateId.fromCBOR(
  // a 32 byte state id; the value is irrelevant to the wire rules
  new Uint8Array([0x58, 0x20, ...new Uint8Array(32).fill(0xab)]),
);

/** Answer each request with the next reply (the last repeats), under the id of the request. */
function serve(...replies: object[]): { bodies: { method: string; params: Record<string, unknown> }[] } {
  const bodies: { method: string; params: Record<string, unknown> }[] = [];
  jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
    const body = JSON.parse(init?.body as string) as { id: string; method: string; params: Record<string, unknown> };
    bodies.push(body);
    const reply = replies[Math.min(bodies.length - 1, replies.length - 1)];
    return Promise.resolve(new Response(JSON.stringify({ ...reply, id: body.id, jsonrpc: '2.0' })));
  });
  return { bodies };
}

/**
 * The fixtures' proof hex is a Go test fixture with placeholder certificates that the SDK's strict CBOR decoder rightly
 * refuses; the wire rules under test do not depend on the proof content. Every proof of a fixture response is replaced by
 * one real SDK-encoded proof of an uncertified state, and the replacement is what the decoded response is compared to.
 */
let realProof = '';
beforeAll(async () => {
  const world = await ShardedWorld.create(0);
  realProof = HexConverter.encode((await world.client('').getInclusionProof(stateId)).toCBOR());
});
function withRealProofs<T>(value: T, inProof = false): T {
  if (typeof value === 'string') {
    return (inProof ? realProof : value) as T;
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).map((v) => withRealProofs(v, inProof)) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        withRealProofs(v, inProof || k === 'proof' || k === 'proofs' || (k === 'result' && typeof v === 'string')),
      ]),
    ) as T;
  }
  return value;
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

const settle = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    (value) => value,
    (e: unknown) => e,
  );

describe('long-poll A0 fixtures', () => {
  const client = new AggregatorClient('https://example.com');
  afterEach(() => jest.restoreAllMocks());

  it('are the copied files (sha256 of the README table)', () => {
    const table = [...read('README.md').matchAll(/\| `([^`]+)` \| ([0-9a-f]{64}) \|/g)];
    expect(table.map((m) => m[1]).sort()).toEqual([
      'capability.json',
      'echo.json',
      'golden/batch-nowait.json',
      'golden/v2-nowait.json',
      'params.json',
    ]);
    for (const [, file, sum] of table) {
      expect(
        createHash('sha256')
          .update(readFileSync(join(DIR, file)))
          .digest('hex'),
      ).toEqual(sum);
    }
  });

  describe('params.json (T1, client side)', () => {
    const cases = json<{ cases: IParamsCase[] }>('params.json').cases;

    // JSON.parse sees what a JS caller could pass; lexical forms (1.0, 1e3, duplicates) are not expressible as numbers
    it.each(cases.filter((c) => c.valid && typeof c.waitMs === 'number'))(
      'sends the valid $name exactly',
      async (c) => {
        const wait = c.waitMs as number;
        const { bodies } = serve({ result: 'f6' });
        const call =
          c.method === 'get_inclusion_proofs.v1'
            ? client.getInclusionProofs([stateId], { waitMs: wait })
            : client.getInclusionProof(stateId, { waitMs: wait });
        await settle(call);
        expect(bodies[0].method).toEqual(c.method);
        expect(bodies[0].params.waitMs).toBe(wait);
      },
    );

    it.each(
      cases.filter((c) => {
        if (c.valid || /"waitMs":\s*-?\d+,\s*"wait/.test(c.params)) {
          return false;
        }
        try {
          const parsed = JSON.parse(c.params) as { stateRoot?: unknown; waitMs?: unknown };
          return 'waitMs' in parsed && !isWireMilliseconds(parsed.waitMs);
        } catch {
          return false;
        }
      }),
    )('refuses the invalid $name before sending', async (c) => {
      const { waitMs } = JSON.parse(c.params) as { waitMs: unknown };
      const { bodies } = serve({ result: 'f6' });
      const error =
        c.method === 'get_inclusion_proofs.v1'
          ? await settle(client.getInclusionProofs([stateId], { waitMs: waitMs as number }))
          : await settle(client.getInclusionProof(stateId, { waitMs: waitMs as number }));
      expect(
        c.method === 'get_inclusion_proofs.v1' ? error instanceof BatchProofError : error instanceof RangeError,
      ).toBe(true);
      expect(bodies).toHaveLength(0);
    });

    it.each(cases.filter((c) => /exact-root-wait/.test(c.name)))('refuses $name locally', async () => {
      const { bodies } = serve({ result: 'f6' });
      const root = new DataHash(HashAlgorithm.SHA256, new Uint8Array(32).fill(0xcd));
      for (const waitMs of [0, 1000]) {
        const error = await settle(client.getInclusionProofs([stateId], { stateRoot: root, waitMs }));
        expect(error).toMatchObject({ detail: 'wait_with_state_root', kind: 'rejected' });
      }
      expect(bodies).toHaveLength(0);
    });
  });

  describe('echo.json (T2)', () => {
    const cases = json<{ cases: IEchoCase[] }>('echo.json').cases.filter(
      (c) => !c.name.startsWith('batch/invalid-wait') && !c.name.startsWith('v2/error-invalid-wait'),
    );

    it.each(cases.filter((c) => c.request.method === 'get_inclusion_proof.v2'))('decodes $name', async (c) => {
      const { params } = c.request;
      const { bodies } = serve(withRealProofs(c.response));
      const options = {
        ...(params.includeStatus === true ? { includeStatusHint: true } : {}),
        ...(params.waitMs === undefined ? {} : { waitMs: params.waitMs }),
      };
      const outcome = await settle(client.getInclusionProof(stateId, options));
      expect(bodies[0].params.waitMs).toBe(params.waitMs);
      if (c.response.error) {
        expect(outcome).toBeInstanceOf(JsonRpcDataError);
        expect((outcome as JsonRpcDataError).code).toBe(c.response.error.code);
        expect((outcome as JsonRpcDataError).data).toEqual(c.response.error.data);
        return;
      }
      const result = c.response.result;
      const expectedEcho = typeof result === 'object' ? ((result as { waitedMs?: number }).waitedMs ?? null) : null;
      expect(outcome).toMatchObject({ waitedMs: expectedEcho });
      if (typeof result === 'object') {
        expect(HexConverter.encode((outcome as { toCBOR(): Uint8Array }).toCBOR())).toEqual(realProof);
      }
    });

    it.each(cases.filter((c) => c.request.method === 'get_inclusion_proofs.v1'))('decodes $name', async (c) => {
      const { params } = c.request;
      // an invalid id (the validation example) is the server's to reject; the client sends a valid one in its place
      const ids = (params.stateIds ?? [])
        .filter((hex) => hex.length === 64)
        .map((hex) => StateId.fromCBOR(new Uint8Array([0x58, 0x20, ...HexConverter.decode(hex)])));
      const { bodies } = serve(withRealProofs(c.response));
      const outcome = await settle(
        client.getInclusionProofs(
          ids.length === 2 ? ids : [stateId],
          params.waitMs === undefined ? {} : { waitMs: params.waitMs },
        ),
      );
      expect(bodies[0].params.waitMs).toBe(params.waitMs);
      if (c.response.error) {
        const data = c.response.error.data as { detail?: string; waitedMs?: number } | undefined;
        if (c.response.error.code === -32602 && data?.detail !== 'invalid_state_id') {
          return;
        }
        expect(outcome).toBeInstanceOf(BatchProofError);
        expect((outcome as BatchProofError).code).toBe(c.response.error.code);
        expect((outcome as BatchProofError).waitedMs).toBe(data?.waitedMs ?? null);
        return;
      }
      const echo = (c.response.result as { waitedMs?: number }).waitedMs ?? null;
      expect(outcome).toMatchObject({ requests: 1, waitedMs: echo });
      expect((outcome as { proofs: unknown[] }).proofs).toHaveLength(2);
    });

    it('never carries an echo on the no-wait examples', () => {
      for (const c of cases.filter((x) => x.request.params.waitMs === undefined)) {
        expect(JSON.stringify(c.response)).not.toContain('waitedMs');
      }
    });
  });

  describe('capability.json (T8)', () => {
    const cases = json<{ cases: ICapabilityCase[] }>('capability.json').cases;
    const byName = (name: string): ICapabilityCase => cases.find((c) => c.name === name) as ICapabilityCase;

    it('retries exactly once on the generic malformed params and propagates the second error', async () => {
      const first = byName('strict-parser-generic-malformed-params').response as object;
      const second = byName('retry-fails-again').second as object;
      const { bodies } = serve(first, second);
      const error = await settle(client.getInclusionProofs([stateId], { waitMs: 5000 }));
      expect(bodies).toHaveLength(2);
      expect(bodies[0].params.waitMs).toBe(5000);
      expect(bodies[1].params).toEqual({ stateIds: [ID], stateRoot: 'latest' });
      expect(error).toMatchObject({ code: -32602, detail: 'malformed_params', requests: 2 });
    });

    it.each(cases.filter((c) => c.action === 'propagate' && typeof c.response === 'object'))(
      'does not retry: $name',
      async (c) => {
        const { bodies } = serve(c.response as object);
        const error = await settle(client.getInclusionProofs([stateId], { waitMs: 5000 }));
        expect(bodies).toHaveLength(1);
        expect(error).toBeInstanceOf(BatchProofError);
      },
    );

    it('a bad echo is a protocol error', async () => {
      for (const waitedMs of [-1, 1.5, '3', null, 2 ** 53]) {
        serve({ result: { proofs: [], waitedMs } });
        const error = await settle(client.getInclusionProofs([stateId], { waitMs: 5000 }));
        expect(error).toMatchObject({ kind: 'invalid_response' });
        jest.restoreAllMocks();
      }
      serve({ result: { proof: 'f6', waitedMs: -1 } });
      expect(await settle(client.getInclusionProof(stateId, { waitMs: 5000 }))).toBeInstanceOf(JsonRpcResponseError);
    });
  });

  describe('golden/ (T3, no-wait requests)', () => {
    type IGolden = { name: string; request: string; response: string }[];

    it.each(['golden/v2-nowait.json', 'golden/batch-nowait.json'])(
      '%s: the same params go out and the recorded answers decode as before',
      async (file) => {
        const golden = json<IGolden>(file);
        expect(golden.length).toBeGreaterThan(0);
        for (const c of golden) {
          if (!isJson(c.request)) {
            continue; // raw bytes that are not JSON are the server's to answer
          }
          const request = JSON.parse(c.request) as {
            method: string;
            params: { includeStatus?: boolean; stateId?: string; stateIds?: string[]; stateRoot?: string };
          };
          const reply = JSON.parse(c.response) as { error?: object; result?: unknown };
          if (
            Object.keys(request.params).some((k) => !['includeStatus', 'stateId', 'stateIds', 'stateRoot'].includes(k))
          ) {
            continue; // unknown members are what a raw client sends, never the SDK
          }
          const status: unknown = request.params.includeStatus;
          if (status !== undefined && typeof status !== 'boolean') {
            continue;
          }
          const root = request.params.stateRoot;
          if (
            (request.method === 'get_inclusion_proof.v2' && request.params.stateId?.length !== 64) ||
            (root !== undefined && root !== 'latest' && !(typeof root === 'string' && root.length === 64))
          ) {
            continue; // not a request the SDK can build
          }
          const ids0 = request.params.stateIds;
          if (
            request.method === 'get_inclusion_proofs.v1' &&
            !(Array.isArray(ids0) && ids0.length > 0 && ids0.every((i) => i.length === 64))
          ) {
            // a batch without valid ids is the server's validation to exercise, not a request the SDK can send
            continue;
          }
          const { bodies } = serve(
            reply.error ? { error: reply.error } : { result: withRealProofs({ result: reply.result }).result },
          );
          const { params } = request;
          let outcome: unknown;
          if (request.method === 'get_inclusion_proof.v2') {
            const id = StateId.fromCBOR(new Uint8Array([0x58, 0x20, ...HexConverter.decode(params.stateId as string)]));
            outcome = await settle(
              client.getInclusionProof(id, params.includeStatus === true ? { includeStatusHint: true } : {}),
            );
          } else {
            const ids = (params.stateIds as string[]).map((hex) =>
              StateId.fromCBOR(new Uint8Array([0x58, 0x20, ...HexConverter.decode(hex)])),
            );
            const exact = params.stateRoot !== undefined && params.stateRoot !== 'latest';
            outcome = await settle(
              client.getInclusionProofs(
                ids,
                exact
                  ? { stateRoot: new DataHash(HashAlgorithm.SHA256, HexConverter.decode(params.stateRoot as string)) }
                  : {},
              ),
            );
          }
          if (bodies.length === 0) {
            continue; // refused locally (e.g. duplicate ids): nothing went out
          }
          // identical members, in identical order, and no new member
          expect(bodies[0].method).toEqual(request.method);
          // (the SDK has always spelled the default view out as `"stateRoot":"latest"`; the server treats both alike)
          const sentParams = { ...bodies[0].params };
          if (params.stateRoot === undefined && sentParams.stateRoot === 'latest') {
            delete sentParams.stateRoot;
          }
          // `includeStatus:false` is the same request as no flag: the SDK leaves it out
          const expectedParams: Record<string, unknown> = { ...params };
          if (expectedParams.includeStatus === false) {
            delete expectedParams.includeStatus;
          }
          expect(JSON.stringify(sentParams)).toEqual(JSON.stringify(expectedParams));
          expect(c.request).not.toContain('waitMs');
          expect(c.response).not.toContain('waitedMs');
          if (!reply.error) {
            expect(outcome).not.toBeInstanceOf(Error);
            expect((outcome as { waitedMs: number | null }).waitedMs).toBeNull();
          }
          jest.restoreAllMocks();
        }
      },
    );
  });
});
