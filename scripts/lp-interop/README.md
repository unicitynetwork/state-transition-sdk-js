# JS long-poll interop driver

`run.mjs` drives the **current** JS SDK (`lib/`, so `npm run build` first) against an aggregator URL and counts every HTTP
request the SDK makes. Scenarios follow `orchestration/brief-lp-interop.md`: `l2` happy path (proof requests per state, echoes),
`l3` short wait on a pending state, `l4` batch wait-all and batch with an unknown id, `l5` fallback pacing and batch parser retry
count, `l6` cap (run `l2`'s flow against `LONG_POLL_MAX_WAITERS=0`), `l7` polling vs long poll (states, p50/p90/p99, proof requests per
verified state, failed states counted separately).

```sh
npm ci && npm run build
node scripts/lp-interop/run.mjs --url http://localhost:3000 --trust-base tests/e2e/trust-base.json --label S2-LP \
  --scenario l2,l3,l4,l5,l6,l7 --wait-ms 5000 --states 50 --concurrency 10 --report /tmp/js-s2-lp.json
```

The released 3.0.1 runner is `compat/released-3.0.1` (`run.mjs`, `--report` now includes `requestCounts`). The driver reports
facts; it does not decide PASS/FAIL of a matrix cell. `tests/unit/compat/LpInteropRunnerTest.ts` self-tests it against a
server that ignores `waitMs` (needs the build).

## L7 load model and what is not measured

- Default is **closed loop**: `--concurrency N` workers each submit the next state after the previous one verified, so a faster
  mode raises its own arrival rate. Requests per verified state are comparable between the two runs; latencies are **not**.
  The report names the model (`loadModel`) and the `achievedStatesPerSecond` of each run.
- `--rate R` gives an **open loop**: state *i* is submitted at *i/R* seconds whatever the latency, so both runs see the same
  offered load and the latencies are comparable (provided the system keeps up; compare `achievedStatesPerSecond`).
- Failed states are not hidden: `proofRequestsVerified` and `proofRequestsFailed` are separate, and per-state
  `proofRequestsPerVerifiedState` uses verified states only. A run with no samples reports `null` percentiles.
- Not measured by this driver (they need server-side data): rounds from admission to proof, publication-to-response as a
  fraction of the round, peak parked waiters, RSS/heap per waiter (`notMeasured` in the l7 report).
- `ok` in a scenario only means the flow completed and proofs verified; expectations such as L6's "all echoes 0, gaps >=
  interval" are reported as facts (`expectationNotChecked`), not asserted.
