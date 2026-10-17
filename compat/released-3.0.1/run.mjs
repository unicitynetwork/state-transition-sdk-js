#!/usr/bin/env node
// Compatibility gate: drives the RELEASED @unicitylabs/state-transition-sdk@3.0.1 (installed from npm, integrity
// recorded in package-lock.json, never rebuilt from this repository) against an aggregator URL.
//
//   npm ci --ignore-scripts && node run.mjs --url http://host:3000 --trust-base trust-base.json [--api-key K]
//        [--timeout-ms 30000] [--report report.json]
//
// Steps (all must pass, none is skipped silently): empty answer / HTTP 404 handling for an unknown state, submission,
// empty-to-included polling with full proof verification, that the released client only ever sends its original
// request members (so no `waitMs`/`includeStatus`), cancellation, a proof corrupted in transit is rejected, and HTTP
// 404 on a proof request keeps polling. Exit code 0 only if every step passed.
import { readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { parseArgs } from 'node:util';

import { integrityProblems, RELEASED } from './check-integrity.mjs';

const { values } = parseArgs({
  options: {
    'api-key': { type: 'string' },
    report: { type: 'string' },
    'timeout-ms': { default: '30000', type: 'string' },
    'trust-base': { type: 'string' },
    url: { type: 'string' },
  },
});
if (!values.url || !values['trust-base']) {
  console.error(
    'usage: node run.mjs --url <aggregator url> --trust-base <trust base json> [--api-key K] [--timeout-ms N] [--report file]',
  );
  process.exit(2);
}
const problems = integrityProblems();
if (problems.length > 0) {
  console.error(`refusing to run: not the released package:\n- ${problems.join('\n- ')}`);
  process.exit(2);
}
const TIMEOUT_MS = Number(values['timeout-ms']);
if (!Number.isInteger(TIMEOUT_MS) || TIMEOUT_MS <= 0 || TIMEOUT_MS > 2 ** 31 - 1) {
  console.error(`--timeout-ms must be a positive integer number of milliseconds, got "${values['timeout-ms']}"`);
  process.exit(2);
}

// every JSON-RPC request the released client makes, to prove what it puts on the wire
const sent = [];
let currentStep = null;
const proxyUrls = new Set(); // requests to the local corruption/404 proxies are not requests to the server under test
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  try {
    const body = JSON.parse(init?.body ?? '{}');
    sent.push({ method: body.method, params: body.params, step: currentStep, url: String(url) });
  } catch {
    sent.push({ method: '?', params: null, step: currentStep, url: String(url) });
  }
  return realFetch(url, init);
};

const lib = (path) => import(`@unicitylabs/state-transition-sdk/lib/${path}`);
const [
  { AggregatorClient },
  { StateTransitionClient },
  { RootTrustBase },
  { UnicityCertificateVerifier },
  { UnicitySealQuorumSignaturesVerificationRule },
  { Secp256k1SignatureVerifier },
  { SigningService },
  { SignaturePredicate },
  { PredicateVerifierService },
  { MintTransaction },
  { TokenSalt },
  { TokenType },
  { CertificationData },
  { StateId },
  { waitInclusionProof, SleepError },
  { NetworkId },
] = await Promise.all([
  lib('api/AggregatorClient.js'),
  lib('StateTransitionClient.js'),
  lib('api/bft/RootTrustBase.js'),
  lib('api/bft/verification/UnicityCertificateVerifier.js'),
  lib('api/bft/verification/rule/UnicitySealQuorumSignaturesVerificationRule.js'),
  lib('crypto/secp256k1/Secp256k1SignatureVerifier.js'),
  lib('crypto/secp256k1/SigningService.js'),
  lib('predicate/builtin/SignaturePredicate.js'),
  lib('predicate/verification/PredicateVerifierService.js'),
  lib('transaction/MintTransaction.js'),
  lib('transaction/TokenSalt.js'),
  lib('transaction/TokenType.js'),
  lib('api/CertificationData.js'),
  lib('api/StateId.js'),
  lib('util/InclusionProofUtils.js'),
  lib('api/NetworkId.js'),
]);

const trustBase = RootTrustBase.fromJSON(JSON.parse(readFileSync(values['trust-base'], 'utf8')));
const predicateVerifier = PredicateVerifierService.create();
const certificateVerifier = new UnicityCertificateVerifier(
  new UnicitySealQuorumSignaturesVerificationRule(new Secp256k1SignatureVerifier()),
);
const insecure = new URL(values.url).protocol !== 'https:';
const clientFor = (url) => new StateTransitionClient(new AggregatorClient(url, values['api-key'] ?? null, insecure));
const signer = SigningService.generate();

const mint = () =>
  MintTransaction.create(NetworkId.fromId(trustBase.networkId.id), SignaturePredicate.create(signer.publicKey), {
    salt: TokenSalt.generate(),
    tokenType: TokenType.generate(),
  });
const wait = (client, tx, signal) =>
  waitInclusionProof(client, trustBase, predicateVerifier, certificateVerifier, tx, signal, 100);

/** A proxy to the aggregator that can rewrite the proof answers; records what it saw. */
async function proxy(rewrite) {
  const seen = { mutated: 0, requests: 0, upstreamFailures: 0 };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      seen.requests++;
      const body = Buffer.concat(chunks);
      const isProof = /get_inclusion_proof/.test(body.toString());
      const answer = isProof ? rewrite?.(body.toString()) : undefined;
      if (answer?.status !== undefined) {
        res.writeHead(answer.status, { 'content-type': 'text/plain' }).end(answer.body ?? 'not found');
        return;
      }
      try {
        const upstream = await realFetch(values.url, {
          body,
          headers: {
            'content-type': 'application/json',
            'x-compat-proxy': '1',
            ...(values['api-key'] ? { 'x-api-key': values['api-key'] } : {}),
          },
          method: 'POST',
        });
        let text = await upstream.text();
        if (upstream.ok && isProof && answer?.mutate) {
          const mutated = answer.mutate(text);
          if (mutated !== text) seen.mutated++;
          text = mutated;
        }
        res.writeHead(upstream.status, { 'content-type': 'application/json' }).end(text);
      } catch {
        seen.upstreamFailures++;
        res.writeHead(502, { 'content-type': 'text/plain' }).end('upstream failure');
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const proxyUrl = `http://127.0.0.1:${server.address().port}`;
  proxyUrls.add(proxyUrl);
  return { close: () => server.close(), seen, url: proxyUrl };
}

const isProxy = (r) => [...proxyUrls].some((u) => r.url.startsWith(u));
const countsOf = (list) => {
  const counts = {};
  for (const r of list) counts[r.method] = (counts[r.method] ?? 0) + 1;
  return counts;
};
const steps = [];
async function step(name, fn) {
  const begun = Date.now();
  currentStep = name;
  try {
    const detail = await fn();
    steps.push({ detail, ms: Date.now() - begun, name, status: 'pass' });
  } catch (e) {
    steps.push({ detail: String(e?.stack ?? e), ms: Date.now() - begun, name, status: 'fail' });
  }
  currentStep = null;
  steps.at(-1).requests = countsOf(sent.filter((r) => r.step === name && !isProxy(r)));
  const last = steps.at(-1);
  console.log(`${last.status.toUpperCase().padEnd(4)} ${name}${last.status === 'pass' ? '' : `\n     ${last.detail}`}`);
}

const client = clientFor(values.url);
const tx = await mint();
const stateId = await StateId.fromTransaction(tx);
let included;

await step('unknown state: empty answer or HTTP 404, never a proof', async () => {
  const unknown = await StateId.fromTransaction(await mint());
  try {
    const response = await client.getInclusionProof(unknown);
    if (response.inclusionProof !== null) throw new Error('a proof for a state nobody submitted');
    return { outcome: 'empty_proof' };
  } catch (e) {
    if ((e?.name === 'JsonRpcNetworkError' && e.status === 404) || e?.code === -32020 || e?.code === -32021) {
      return { outcome: `error ${e.status ?? e.code}` };
    }
    throw e;
  }
});

await step('submission is accepted (SUCCESS)', async () => {
  const response = await client.submitCertificationRequest(await CertificationData.fromMintTransaction(tx));
  if (response.status !== 'SUCCESS') throw new Error(`status ${response.status}`);
  return { status: response.status };
});

await step('empty-to-included polling with full proof verification', async () => {
  const before = sent.length;
  const proof = await wait(client, tx, AbortSignal.timeout(TIMEOUT_MS));
  const certified = await tx.toCertifiedTransaction(trustBase, predicateVerifier, certificateVerifier, proof);
  if (!certified) throw new Error('no certified transaction');
  included = proof;
  const polls = sent.slice(before).filter((r) => r.method === 'get_inclusion_proof.v2').length;
  // `polls === 1` is a server that certified before the first read; the empty answer is evidenced by the first step
  return { polls };
});

await step('the released client sends only its original request members', async () => {
  const proofs = sent.filter((r) => /get_inclusion_proof/.test(r.method));
  if (proofs.length === 0) throw new Error('no proof requests recorded');
  for (const r of proofs) {
    const keys = Object.keys(r.params ?? {});
    if (r.method !== 'get_inclusion_proof.v2' || keys.length !== 1 || keys[0] !== 'stateId') {
      throw new Error(`unexpected request ${r.method} ${JSON.stringify(keys)}`);
    }
  }
  return { proofRequests: proofs.length };
});

await step('cancellation ends a wait promptly with SleepError', async () => {
  const never = await mint();
  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error('compat cancel')), 300);
  const begun = Date.now();
  try {
    await wait(client, never, controller.signal);
  } catch (e) {
    if (!(e instanceof SleepError)) throw e;
    const took = Date.now() - begun;
    if (took > 5000) throw new Error(`took ${took}ms`);
    return { tookMs: took };
  }
  throw new Error('a wait for an unsubmitted state returned');
});

await step('a proof corrupted in transit is rejected, never accepted', async () => {
  if (!included) throw new Error('needs the included proof of the earlier step');
  const flip = (text, at) => {
    const m = JSON.parse(text);
    const hex = typeof m.result === 'string' ? m.result : m.result?.proof;
    if (typeof hex !== 'string') return text;
    const i = Math.floor(hex.length * at) & ~1;
    const bytes = Buffer.from(hex, 'hex');
    bytes[i / 2] ^= 0xff;
    const bad = bytes.toString('hex');
    if (typeof m.result === 'string') m.result = bad;
    else m.result.proof = bad;
    return JSON.stringify(m);
  };
  const mutations = {
    flip25: (t) => flip(t, 0.25),
    flip50: (t) => flip(t, 0.5),
    flip75: (t) => flip(t, 0.75),
    truncate: (t) => {
      const m = JSON.parse(t);
      const key = typeof m.result === 'string' ? null : 'proof';
      const hex = key ? m.result[key] : m.result;
      const cut = hex.slice(0, hex.length - 8);
      if (key) m.result[key] = cut;
      else m.result = cut;
      return JSON.stringify(m);
    },
  };
  // A rejection only counts when the released client's own decoding or verification refused a proof that really arrived,
  // mutated by the proxy: not a transport/HTTP error, not the step's own timeout.
  const outcomes = {};
  for (const [name, mutate] of Object.entries(mutations)) {
    const p = await proxy(() => ({ mutate }));
    let error;
    try {
      await wait(clientFor(p.url), tx, AbortSignal.timeout(10000));
      throw new Error(`${name}: a corrupted proof was accepted`);
    } catch (e) {
      if (String(e?.message).includes('was accepted')) throw e;
      error = e;
    } finally {
      p.close();
    }
    if (p.seen.mutated < 1)
      throw new Error(
        `${name}: the proxy never delivered a mutated proof (${p.seen.requests} requests, ${p.seen.upstreamFailures} upstream failures)`,
      );
    if (
      error instanceof SleepError ||
      error?.name === 'JsonRpcNetworkError' ||
      error?.name === 'JsonRpcError' ||
      error?.name === 'TypeError'
    ) {
      throw new Error(`${name}: rejected by ${error?.name}, not by proof decoding/verification: ${error?.message}`);
    }
    outcomes[name] = {
      error: error?.name ?? 'Error',
      message: String(error?.message).slice(0, 120),
      mutated: p.seen.mutated,
    };
  }
  return outcomes;
});

await step('HTTP 404 on a proof request keeps polling (legacy unknown answer)', async () => {
  const p = await proxy(() => ({ status: 404 }));
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('done')), 1200);
    try {
      await wait(clientFor(p.url), tx, controller.signal);
      throw new Error('returned a proof from 404s');
    } catch (e) {
      if (!(e instanceof SleepError)) throw e;
    }
    if (p.seen.requests < 2) throw new Error(`only ${p.seen.requests} request(s): did not keep polling`);
    return { requests: p.seen.requests };
  } finally {
    p.close();
  }
});

// HTTP requests the released client made to the SERVER UNDER TEST (requests to the local proxies are excluded, they
// are reported separately); per step in `steps[].requests`, the total here
const serverRequests = sent.filter((r) => !isProxy(r));
const requestCounts = countsOf(serverRequests);
const proxyRequests = countsOf(sent.filter(isProxy));
const report = {
  aggregator: values.url,
  proxyRequests,
  requestCounts,
  package: RELEASED,
  steps,
  verdict: steps.every((s) => s.status === 'pass') ? 'pass' : 'fail',
};
if (values.report) writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `\n${RELEASED.name}@${RELEASED.version}: ${report.verdict.toUpperCase()} (${steps.filter((s) => s.status === 'pass').length}/${steps.length})`,
);
process.exit(report.verdict === 'pass' ? 0 : 1);
