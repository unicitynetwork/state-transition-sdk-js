# Shared trust-base V2 vectors

`vectors.json` is vendored byte for byte, not generated here:

- source: `ristik/bft-go-base`, branch `utb/upstream-v2`, commit `c32454f` (on upstream `cc768d1`; c202b48 plus the shared rule that network id 0 is an `invalid` entry), `testdata/trust-base-v2/v1/vectors.json`
- sha256: `dfcf63a085de29be9141821c3089f0f08548314470df8e96e4be43d4da466c09`
- regenerate there with `UPDATE_VECTORS=1 go test ./types -run TestTrustBaseV2SharedVectors`; never edit this copy.

Used by this PR: `entries`, `decode` and `bundles`. `history` and `weightedQuorum` belong to the history verifier (the next PR of the stack).

## Maximum-size entry (`max-entry/v1/max-entry.json`)

Vendored byte for byte, not generated here:

- source: `ristik/bft-go-base`, branch `utb/gettrustbase-codec`, commit `81ee667` (PR 4), `testdata/trust-base-v2/max-entry/v1/max-entry.json`
- sha256: `c4c5970307c1780fa08108529e3ef9e37803726b6df1843d61c8421f97a795b6`
- epoch 1 is a genesis of 256 members with 128-byte node ids; epoch 2 carries the signatures of all 256 predecessor members, 95,365 bytes, the largest valid entry. The per-entry cap is 128 KiB (`MaxTrustBaseEntryBytes`). `bundle` is the two-entry release bundle (tag 39015) of the pair; the genesis entry id is its pin.
