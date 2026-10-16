# F1 fixture corpus (aggregator-go `testdata/uc-consolidation/v1`)

Copied verbatim (no edits) from `unicitynetwork/aggregator-go` PR #210 (proof status hints, #209), commit
`86aa38e650af2c84e9fe6dfe058f60d61ee50fa5`, directory `testdata/uc-consolidation/v1/`, which replaces the batch negatives
`rpc-*-state-not-included` by `rpc-master-state-pending|expired|unknown` and `rpc-peer-state-not-in-root` (details
`state_pending`, `state_expired`, `state_unknown`, `state_not_in_root` with per-class `indexes`). Earlier vendoring: aggregator-go
`e5bdd7a86d56e2d9a8fbe2ef9a22f777b52a68d2`. The manifest records its generator commits
and a SHA-256 of every payload file; `tests/unit/consolidation/F1CorpusTest.ts` re-checks them.

The corpus describes proof bundles (`get_inclusion_proof.v2` results and certification requests), so it drives
`ProofConsolidator` directly; token level behaviour is tested with locally built tokens.
