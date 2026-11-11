# Shared UTB cache vectors

`vectors.json` is vendored byte for byte (sha256 `a071fef1f3d5c34a2918e8d9f6e50a083aa87bc1261740f5e4ecedb7b8790342`) from
`ristik/state-transition-sdk-rust`, branch `dev2/utb-cache-1` (PR #17), commit `c18f8da` (the 128 KiB per-entry cap: only `limits.maxEntryBytes` differs from `ecd4712`), path `tests/vectors/utb-cache/v1/vectors.json`.
It is generated there (`UTB_CACHE_UPDATE_VECTORS=1 cargo test --test utb_cache vectors_are_current`); do not edit it here.

Sections: `entries`, `bundles` (incl. malformed ones), `pins` (valid and invalid), `open`, `offer`, `flush`, `key`, `revision`. All authorities use
private test network ids and a custom trust namespace; no public pin is involved. Design: `briefs/utb-cache-design.md`.
`tests/unit/api/bft/trustbase/TrustBaseSessionVectorsTest.ts` runs every case. Compare-and-swap races and contention are not in the file;
`TrustBaseSessionTest.ts` covers them.
