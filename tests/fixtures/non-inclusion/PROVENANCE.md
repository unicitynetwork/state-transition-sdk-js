`v2/` is vendored byte for byte from aggregator-go PR #252 (owner decision D), final head
`13496d41bd056948696d4ebc13a1d2cb3a4379ab`, directory `testdata/non-inclusion/v2`, schema 2: discriminated snapshot
outcomes, fixed partition 7, no freshness option or `stale` verdict, sharded positives, large uint64 snapshot values,
`policy.json` and `sequences.json`. Generator: `UC_FIXTURE_AGGREGATOR_COMMIT=b25dd916fba88b18066bf239b6130b386d3347dd go run
./cmd/gen-ni-fixtures -out testdata/non-inclusion/v2` (the manifest records it and the module versions).
`manifest.json` lists the SHA-256 of every other file, and the manifest's own SHA-256 is pinned in
`tests/unit/api/NonInclusionCorpusTest.ts`: `7bfb40a209b137acdcfa3deea0834a54924ce32e7d9d41c0d9d583ae3dc5dd8b`. Both are checked by that test. It replaces the earlier `v1` corpus
and the locally generated sharded vectors (`non-inclusion-sharded`), which the shared corpus now covers.

Manifest refresh: `v2/manifest.json` was re-vendored byte for byte from aggregator-go `non-inclusion` at
`02263dd41dae1d122ec036fc950b158eebc2dd7a`. Only its module lines changed (bft-core `v1.1.1-0.20261019010732-0800b70ef621`,
bft-go-base `v1.1.1-0.20261018233336-465dccf17fba`); no corpus file changed, so every listed file hash is the same.

Authority refresh (owner decision §55, no JSON or version-1 trust base in 4.0.0): `v2/` was re-vendored byte for byte from ristik/aggregator-go
`risto/ni-corpus-utb-authority` @ `427da05` (generator commit `b420fd1`, the same generator command). The authorities `authority/*.cbor` are Unicity
Trust Base v2 bundles (tag 39015, one genesis entry each), contexts name them as `trustBaseBundle`, the `authority/*.json` files and the
`trustBaseJson` field are gone, and the fixture network is the local network (3), so every case and `policy.json` is regenerated on it. The manifest's
own SHA-256 is now `559db36b6d0145f61f6751e992a58c88fa7c518123e8e384cbcbd62fc5fd2977`.
