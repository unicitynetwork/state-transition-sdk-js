# F1 fixture corpus (aggregator-go `testdata/uc-consolidation/v1`)

Copied verbatim (no edits) from `unicitynetwork/aggregator-go` PR #253 (owner decision C: fixed aggregation partition 7),
commit `b4911c04af7d5c4b77f805e65d7e1a97663f8ff9`, directory `testdata/uc-consolidation/v1/`, regenerated there for
partition 7 (it was `0x0a0b0c0d`) with the documented generator, on top of aggregator-go `uc-consolidation` at
`89e8909` (bft-core `df371b701a99`). It adds the negatives `validly-signed-other-partition` (every certificate, the view
and the proofs authentic, partition 8) and `context-wrong-partition` (the context's `partitionId` is an equality assertion
that fails). Earlier vendoring: PR #210 `86aa38e650af2c84e9fe6dfe058f60d61ee50fa5`, `e5bdd7a86d56e2d9a8fbe2ef9a22f777b52a68d2`.
The manifest records its generator commits and a SHA-256 of every payload file;
`tests/unit/consolidation/F1CorpusTest.ts` re-checks them. Once #253 is merged the bytes are those of
`uc-consolidation`; re-vendor from the merge commit if the corpus changes there.

The corpus describes proof bundles (`get_inclusion_proof.v2` results and certification requests), so it drives
`ProofConsolidator` directly; token level behaviour is tested with locally built tokens. The context's `partitionId` is an
assertion: the SDK has no partition option, so the harness rejects a context asserting another value as `invalid_input`.

Authority refresh (owner decision §55): `v1/` was re-vendored byte for byte from ristik/aggregator-go `risto/ni-corpus-utb-authority` @ `427da05`
(generator commit `b420fd1`, see `v1/manifest.json`). Every case carries its authority as a Unicity Trust Base v2 bundle in `trust-base.cbor` (tag 39015,
one genesis entry) on the local network (3); there is no version-1 trust base. Cases are regenerated on that network. The same producer files are in
bft-core `rootchain/consensus/storage/testdata` (ristik/bft-core#1000).
