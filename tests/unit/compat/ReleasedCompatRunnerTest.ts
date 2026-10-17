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
 * Self-test of `compat/released-3.0.1/run.mjs`: the runner (which drives the npm release 3.0.1) against an in-process
 * aggregator that serves exactly what the released client understands. Needs `npm ci --ignore-scripts` in
 * `compat/released-3.0.1`: it is skipped without it, except under `CI`, where a missing install fails the test. It proves
 * the runner itself, not any server.
 */
const DIR = join(__dirname, '../../../compat/released-3.0.1');
const installed = existsSync(join(DIR, 'node_modules/@unicitylabs/state-transition-sdk/package.json'));

jest.setTimeout(180_000);

/** What the corruption proxy's upstream answers: the real proof, an HTTP error, or an answer that cannot be mutated. */
type Mode = 'broken-upstream' | 'normal' | 'unmutatable';

interface IOutcome {
  readonly code: number | null;
  readonly steps: { detail: unknown; name: string; status: string }[];
  readonly verdict: string;
}

async function runAgainst(mode: Mode): Promise<IOutcome> {
  const world = await ShardedWorld.create(0);
  const shard = world.client('');
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      void (async (): Promise<void> => {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as { id: string; method: string; params: unknown };
        // the corruption proxy marks its upstream requests; the other steps talk to this server directly
        const viaProxy = req.headers['x-compat-proxy'] === '1';
        if (viaProxy && mode === 'broken-upstream') {
          res.writeHead(503, { 'content-type': 'text/plain' }).end('upstream down');
          return;
        }
        if (viaProxy && mode === 'unmutatable') {
          res
            .writeHead(200, { 'content-type': 'application/json' })
            .end(
              JSON.stringify({ error: { code: -32603, message: 'nothing to corrupt' }, id: body.id, jsonrpc: '2.0' }),
            );
          return;
        }
        let result: unknown;
        if (body.method === 'get_inclusion_proof.v2') {
          const id = StateId.fromCBOR(
            new Uint8Array([0x58, 0x20, ...HexConverter.decode((body.params as { stateId: string }).stateId)]),
          );
          result = HexConverter.encode((await shard.getInclusionProof(id)).toCBOR());
        } else if (body.method === 'certification_request') {
          // tag(CertificationRequest) [version, stateId, certificationData, 0]
          const tag = CborDeserializer.decodeTag(HexConverter.decode(body.params as string));
          const fields = CborDeserializer.decodeArray(tag.data, 4);
          result = (await shard.submitCertificationRequest(CertificationData.fromCBOR(fields[2]))).toJSON();
        }
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ id: body.id, jsonrpc: '2.0', result }));
      })();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const dir = mkdtempSync(join(tmpdir(), 'compat-'));
  writeFileSync(join(dir, 'trust-base.json'), JSON.stringify(world.trustBase.toJSON()));
  const report = join(dir, 'report.json');
  try {
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(
        process.execPath,
        [
          join(DIR, 'run.mjs'),
          '--url',
          `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
          '--trust-base',
          join(dir, 'trust-base.json'),
          '--report',
          report,
          '--timeout-ms',
          '20000',
        ],
        { cwd: DIR, stdio: 'inherit' },
      );
      child.on('exit', resolve);
    });
    const parsed = JSON.parse(readFileSync(report, 'utf8')) as Omit<IOutcome, 'code'> & {
      package: { integrity: string; version: string };
    };
    expect(parsed.package.version).toBe('3.0.1');
    return { code, steps: parsed.steps, verdict: parsed.verdict };
  } finally {
    server.close();
  }
}

describe('released 3.0.1 compatibility runner', () => {
  it('has its package installed in CI', () => {
    if (process.env.CI) {
      expect(installed).toBe(true);
    }
  });

  const CORRUPTION = 'a proof corrupted in transit is rejected, never accepted';

  (installed ? it : it.skip)('passes against a server with the legacy wire', async () => {
    const outcome = await runAgainst('normal');
    expect(outcome.steps.filter((s) => s.status !== 'pass')).toEqual([]);
    expect(outcome.verdict).toBe('pass');
    expect(outcome.code).toBe(0);
    const corruption = outcome.steps.find((s) => s.name === CORRUPTION);
    // requests to the local proxies are not requests to the server under test
    expect((corruption as unknown as { requests: object }).requests).toEqual({});
    // decoding/verification of the released client refused each mutation, and each reached it mutated
    for (const result of Object.values(corruption?.detail as Record<string, { error: string; mutated: number }>)) {
      expect(result.mutated).toBeGreaterThanOrEqual(1);
      expect(['SleepError', 'JsonRpcNetworkError']).not.toContain(result.error);
    }
  });

  it.each(['broken-upstream', 'unmutatable'] as const)(
    'the corruption step FAILS when the proxy cannot deliver a mutated proof (%s)',
    async (mode) => {
      if (!installed) {
        return;
      }
      const outcome = await runAgainst(mode);
      expect(outcome.steps.find((s) => s.name === CORRUPTION)?.status).toBe('fail');
      expect(outcome.verdict).toBe('fail');
      expect(outcome.code).toBe(1);
    },
  );
});
