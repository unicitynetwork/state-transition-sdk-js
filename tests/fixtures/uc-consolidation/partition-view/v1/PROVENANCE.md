# Partition view V1 test vectors

Source of truth: `unicitynetwork/bft-go-base`, branch `uc-consolidation`, merge commit
`6251c1d73eeefd660b26f3bb1d351dd9c7d683bd` (PR #7, B1: PartitionViewV1 codec).

| File | Origin |
|---|---|
| `manifest.json`, `shards-1.cbor`, `shards-4.cbor`, `shards-8.cbor` | Copied byte-for-byte from `types/testdata/partition-view/v1/` at the commit above (golden codec vectors, checksums in `manifest.json`). |
| `assembly-{1,4,8}.json` | Generated locally from the same commit by `generate-assembly-vectors.go.txt` (a throw-away Go test, copied into `types/` of that checkout, run with `JS_VECTORS_DIR=<dir> go test ./types -run Test_ZZ_DumpJSVectors`). Contains the signed enclosing UC, the trust base authority and the ordinary UCs that `AssembleCertificates` derived for every shard. The signing key is random per run and is not retained; regenerating changes the signature bytes but not the tree. |

`assembly-*.json` is a cross-implementation check for the tree reconstruction and certificate assembly only. It is NOT the
F1 fixture corpus (aggregator-go `testdata/uc-consolidation/v1`), which replaces it once frozen.

`assembly-4-initial.json` is the four shard case where leaf 1 is an initial-state native IR (`&InputRecord{Version: 1}`: null hash and null summary value, mixed with active leaves), added after review.
