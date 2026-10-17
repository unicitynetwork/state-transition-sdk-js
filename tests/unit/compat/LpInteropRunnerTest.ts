/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CertificationData } from '../../../src/api/CertificationData.js';
import { StateId } from '../../../src/api/StateId.js';
import { CborDeserializer } from '../../../src/serialization/cbor/CborDeserializer.js';
import { HexConverter } from '../../../src/util/HexConverter.js';
import { ShardedWorld } from '../../utils/ShardedWorld.js';

/**
 * Self-test of `scripts/lp-interop/run.mjs` against in-process aggregators that behave like the interop servers do:
 * a state that stays pending for a while (certification is delayed), no echo / zero echo / positive echo, and a strict
 * batch parser with and without `data.waitedMs`. Needs `npm run build` (the script imports `lib/`); skipped without it.
 */
const SCRIPT = join(__dirname, '../../../scripts/lp-interop/run.mjs');
const built = existsSync(join(__dirname, '../../../lib/api/AggregatorClient.js'));
const INTERVAL = 60;

jest.setTimeout(180_000);

interface IBehavior {
  /** Batch method: absent (-32601), or a strict parser that answers `malformed_params` to a `waitMs`. */
  readonly batch: 'absent' | 'strict' | 'strict-with-echo';
  /** Delay between the SUCCESS answer of a submission and the certification, so reads in between are pending. */
  readonly certifyDelayMs: number;
  /** `waitedMs` echoed by the v2 answer to a request carrying `waitMs`; `undefined`: the bare string (no echo). */
  readonly echo?: number;
}

interface IReport {
  results: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function runAgainst(
  behavior: IBehavior,
  scenarios: string,
): Promise<{ batchHttp: number; code: number | null; report: IReport }> {
  const world = await ShardedWorld.create(0);
  const shard = world.client('');
  let batchHttp = 0;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      void (async (): Promise<void> => {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as {
          id: string;
          method: string;
          params: { stateId?: string; waitMs?: number };
        };
        let reply: object;
        if (body.method === 'get_inclusion_proof.v2') {
          const id = StateId.fromCBOR(
            new Uint8Array([0x58, 0x20, ...HexConverter.decode(body.params.stateId as string)]),
          );
          const proof = HexConverter.encode((await shard.getInclusionProof(id)).toCBOR());
          reply = {
            result:
              behavior.echo !== undefined && body.params.waitMs !== undefined
                ? { proof, waitedMs: behavior.echo }
                : proof,
          };
        } else if (body.method === 'certification_request') {
          const tag = CborDeserializer.decodeTag(HexConverter.decode(body.params as unknown as string));
          const fields = CborDeserializer.decodeArray(tag.data, 4);
          const data = CertificationData.fromCBOR(fields[2]);
          setTimeout(() => void shard.submitCertificationRequest(data), behavior.certifyDelayMs);
          reply = { result: { status: 'SUCCESS' } };
        } else if (body.method === 'get_inclusion_proofs.v1' && behavior.batch !== 'absent') {
          batchHttp++;
          const understood = behavior.batch === 'strict-with-echo';
          reply = {
            error: {
              code: -32602,
              data: {
                detail: 'malformed_params',
                reason: 'invalid_request',
                retryable: false,
                ...(understood ? { waitedMs: 0 } : {}),
              },
              message: 'Invalid params',
            },
          };
        } else {
          reply = { error: { code: -32601, message: 'Method not found' } };
        }
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ ...reply, id: body.id, jsonrpc: '2.0' }));
      })();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const dir = mkdtempSync(join(tmpdir(), 'lp-interop-'));
  writeFileSync(join(dir, 'trust-base.json'), JSON.stringify(world.trustBase.toJSON()));
  try {
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(
        process.execPath,
        [
          SCRIPT,
          '--url',
          `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
          '--trust-base',
          join(dir, 'trust-base.json'),
          '--report',
          join(dir, 'report.json'),
          '--scenario',
          scenarios,
          '--wait-ms',
          '300',
          '--states',
          '4',
          '--concurrency',
          '2',
          '--interval-ms',
          String(INTERVAL),
        ],
        { stdio: 'inherit' },
      );
      child.on('exit', resolve);
    });
    return { batchHttp, code, report: JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as IReport };
  } finally {
    server.close();
  }
}

(built ? describe : describe.skip)('long-poll interop runner (JS)', () => {
  it('a server that ignores the wait: pending reads are paced at the interval, the wait is dropped after the first answer', async () => {
    const { code, report } = await runAgainst({ batch: 'absent', certifyDelayMs: 400 }, 'l2,l3');
    expect(code).toBe(0);
    const l2 = report.results.l2;
    expect(l2.proofRequests).toBeGreaterThanOrEqual(4); // pending for ~400ms at one read per ~60ms
    expect(l2.proofRequestsWithWait).toBe(1);
    expect(l2.echoes.every((e: unknown) => e === null)).toBe(true);
    expect(l2.minGapMs).toBeGreaterThanOrEqual(INTERVAL - 10);
    expect(report.results.l3.outcome).toMatch(/^pending/);
    expect(report.results.l3.waitedMs).toBeNull();
  });

  it.each([0, 300])('echo %p keeps the wait but is paced (no tight loop)', async (echo) => {
    const { code, report } = await runAgainst({ batch: 'absent', certifyDelayMs: 400, echo }, 'l2,l6');
    expect(code).toBe(0);
    for (const name of ['l2', 'l6']) {
      const r = report.results[name];
      expect(r.echoes.every((e: unknown) => e === echo)).toBe(true);
      expect(r.proofRequestsWithWait).toBe(r.proofRequests);
      expect(r.proofRequests).toBeGreaterThanOrEqual(3);
      expect(r.minGapMs).toBeGreaterThanOrEqual(INTERVAL - 10);
    }
  });

  it('strict batch parser: exactly one retry; the same answer with data.waitedMs is not retried', async () => {
    const strict = await runAgainst({ batch: 'strict', certifyDelayMs: 0 }, 'l5');
    expect(strict.report.results.l5.batchParserProbe).toMatchObject({ code: -32602, httpRequests: 2, requests: 2 });
    expect(strict.batchHttp).toBe(2);
    const understood = await runAgainst({ batch: 'strict-with-echo', certifyDelayMs: 0 }, 'l5');
    expect(understood.report.results.l5.batchParserProbe).toMatchObject({ httpRequests: 1, requests: 1 });
    expect(understood.batchHttp).toBe(1);
  });

  it('l4/l7 report separate verified/failed counts, a load model and null percentiles when nothing verified', async () => {
    const { code, report } = await runAgainst({ batch: 'absent', certifyDelayMs: 150 }, 'l4,l7');
    expect(code).toBe(0);
    const l7 = report.results.l7;
    expect(l7.polling.loadModel).toBe('closed-loop, concurrency=2');
    expect(l7.longPoll).toMatchObject({ failed: 0, proofRequestsFailed: 0, verified: 4 });
    expect(l7.polling.achievedStatesPerSecond).toBeGreaterThan(0);
    expect(l7.notMeasured.length).toBeGreaterThan(0);
  });
});
