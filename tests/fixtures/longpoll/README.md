# Long-poll shared fixtures

Wire-contract fixtures of the optional `waitMs` long-poll on inclusion-proof reads
(aggregator-go#224, revision 3 of `orchestration/arch-long-poll.md`). They are produced and owned
by the Go server (package A) and consumed by the JS SDK (B) and the Rust SDK / rugregator (C),
which copy them byte-for-byte into their own test data and check the checksums below.

Source: aggregator-go `origin/non-inclusion` @ `a352752144ec40ae5ab8b2daf1c324013dca8213`
(the base of the `long-poll` integration branch). `echo.json` was revised on aggregator-go `main`
@ `4e09b47` (invalid-`waitMs` echo ruling of 2026-11-02, "revision 4"; the sha256 above is the
revised file). `params.json`, `capability.json` and `golden/` are unchanged by that revision. JS compatibility baseline: npm
`@unicitylabs/state-transition-sdk@3.0.1`, tag `v3.0.1` @ `f5f0737306901215860aa920a6ab570b699efba8`.

## Files

| File | Checksum (sha256) |
|---|---|
| `params.json` | 4558bd8047b6fb5f0a00c84a167a0fa8f678c4dd325880e3036c3b033b48cb5e |
| `echo.json` | a9dad238857c6953b3f65b5c8680cd8dda2786bccb85a6c633b47644b6c4cd86 |
| `capability.json` | b00701917858d6e2671bec24b9f917de5bb53f4303bdeb6e6795b343ca379c35 |
| `golden/v2-nowait.json` | 62305006cdf18995f8a02b54863468713f905f09ee2f1eb330f530679b1f35a7 |
| `golden/batch-nowait.json` | 5c36869bef6c9298ed9323b3bc606029ba69690936aa0311a0c6b56136fb331e |

`go test ./pkg/api -run TestLongPollFixtures` fails if a file and this table disagree; after an
intentional change, regenerate the file and update its row. Changing a frozen file after B/C
consumed it needs the orchestrator's agreement.

### `params.json` (T1)
`cases[]`: `method` (`get_inclusion_proofs.v1` or `get_inclusion_proof.v2`), `params` (the raw
JSON text, kept as a string so lexical forms such as `-0`, `1e3` and duplicate members survive),
`valid`, and for valid cases `waitMs` (`null` = member absent, else the integer). For invalid cases
`error` names an entry of `errors`. Rules (revision 3 section 2):
- present `waitMs` is a JSON integer token in `[0, 9007199254740991]`: digits only, no sign
  (so no `-0`), fraction or exponent; null, booleans, strings, arrays, objects, duplicates (also
  via an escaped spelling of the key) and overflow are invalid. Zero is valid and distinct from absence;
- values above the server's limit are valid (clamped later);
- batch: any present `waitMs`, zero included, with an exact `stateRoot` is invalid; `"latest"` is fine;
  the batch parser is strict, so other spellings such as `waitms` are unknown members;
- v2: invalid is `-32000` (the code is the contract); unknown members, `waitms` included, are ignored;
- batch invalid is `-32602`, reason `invalid_request`, detail `malformed_params` (exact).

Not covered: envelopes which are not valid JSON (e.g. a bare `01`) fail before any method sees them.

### `echo.json` (T2)
Frozen response examples with the echo: v2 wait-only / wait+status / zero / cap-full / errors
(including `originalData` for non-object error data), batch success, and every batch error class
with `error.data.waitedMs`. No-wait requests never carry `waitedMs`.

Echo rule (revision 4, ruling of 2026-11-02): the echo means the server recognizes the `waitMs`
extension, not that the value was valid or that anything waited. After a valid envelope and the
request-byte / params-byte / RPC-ID preflight, a top-level params member whose decoded name is
exactly `waitMs` opts into metadata, independent of its value (invalid, duplicate, escaped spelling),
of member order and of other invalid fields. Every ensuing method validation error echoes
`waitedMs:0` - invalid `waitMs` (v2 `-32000`; batch `-32602/invalid_request/malformed_params`),
invalid or missing state IDs, unknown batch members, count violations, exact root plus any wait -
and keeps its existing code, detail and validation precedence. An invalid wait never waits.
No echo: omitted `waitMs`; nested or look-alike names (`waitms`); non-object params; invalid
envelopes; unsupported methods; and preflight rejections (`limit_exceeded/request_bytes`, `invalid_id`),
which are decided before `waitMs` is looked at. The `*-preflight-invalid-id-no-echo` cases pin the
no-echo side; the size limits are exercised by the Go server tests only (they would bloat the corpus).
Echo-bearing cases whose exact bytes a parsed object cannot express (duplicates, escaped member names)
carry `rawParams` (exact params text) and `request.params` is then a lossy rendering; cases that fail
preflight carry `rawRequest` (exact request body). Typed SDK clients reject invalid waits locally and
skip these cases (their names start with `v2/error-invalid-wait` or `batch/invalid-wait`).

The echo is also what tells a client the server understands `waitMs`: a bare generic
`malformed_params` (no `waitedMs`) is what an old strict parser returns and triggers the single
parser-negotiation retry; an echoed one is propagated. See `capability.json`.

### `capability.json` (T8)
Client reaction table for the parser-negotiation retry (exactly one retry without `waitMs`,
only on the matched generic `-32602/invalid_request/malformed_params`) and for responses lacking
or carrying a bad echo.

### `golden/` (T3)
`v2-nowait.json`, `batch-nowait.json`: raw JSON-RPC request bodies and exact response bodies
(including the trailing newline) of requests without `waitMs`, recorded from the handlers
before any long-poll change (`LONGPOLL_GOLDEN_UPDATE=1 go test ./internal/service -run TestLongPollGolden`
rewrites them; do that only deliberately). The long-poll handlers must reproduce them byte for byte.
Both sets go through the production gateway server (gin, RequestID/Logging/Timeout middleware, real
registration and limits); v2 additionally through the real `AggregatorService.GetInclusionProofV2`
(cached/published/empty shapes, the known-not-ready shortcut, pre-first-block). Proofs come from
deterministic in-test fixtures (fixed keys), not a live deployment; compare raw bodies, not
re-serialized JSON.
