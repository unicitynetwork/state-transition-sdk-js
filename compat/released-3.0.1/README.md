# Released-package compatibility runner (3.0.1)

Runs the **published** npm package `@unicitylabs/state-transition-sdk@3.0.1` against an aggregator, to check that clients which
never send `waitMs` keep working: it checks behaviour (submission, polling, verification, cancellation, rejection of corrupted
proofs) and the request members the released client sends. It does not compare response bytes; that is the job of the raw
golden clients (`tests/fixtures/longpoll/golden`), so a green run proves less than byte identity. Nothing here is built from this repository's sources.

- Pinned: version `3.0.1`, integrity `sha512-ND4mW7nQjgr8yDdxvHNFheHH3gPijD4y0NS7XU2YPzjsdyDs4LDCYlRG/ZSSEDbz3xVgMh1biL3BY60nGPIsXQ==`,
  tag `v3.0.1` = git `f5f0737306901215860aa920a6ab570b699efba8` (recorded from `npm view`; the git head is not part of the
  installed manifest and is not checked). `npm ci` verifies the tarball against the integrity in `package-lock.json`;
  `run.mjs` refuses to run unless the installed tree is a real directory that npm recorded (`node_modules/.package-lock.json`)
  for the pinned tarball and integrity, so a linked or copied local build cannot be labelled 3.0.1.

```sh
cd compat/released-3.0.1
npm ci --ignore-scripts
node check-integrity.mjs
node run.mjs --url http://localhost:3000 --trust-base ../../tests/e2e/trust-base.json [--api-key K] [--report out.json]
```

Steps (exit code 0 only if all pass): unknown state answer / HTTP 404; submission `SUCCESS`; empty-to-included polling with
full proof verification (`waitInclusionProof` and `toCertifiedTransaction`); the released client sends only
`get_inclusion_proof.v2` with `{stateId}` (no `waitMs`, no `includeStatus`); cancellation; proofs corrupted in transit (bit
flips, truncation, through a local proxy) are rejected **by the released client's own decoding/verification** (the step fails if
the proxy delivered no mutated proof, or if the rejection is an HTTP, transport or timeout error); HTTP 404 on proof requests keeps the wait polling. The JSON report
records the step outcomes, the package identity and request counts for the interop matrix: `steps[].requests` per step and
`requestCounts` in total count only requests to the server under test; requests to the local corruption/404 proxies are listed
separately in `proxyRequests`.

The released package knows neither status hints nor the batch method, so those need the raw golden clients
(`tests/fixtures/longpoll/golden`). `tests/unit/compat/ReleasedCompatRunnerTest.ts` self-tests the runner against an
in-process legacy-wire server, including that the corruption step fails when the proxy's upstream is broken (CI installs the package;
the test fails there if it is missing, and is skipped locally otherwise).
