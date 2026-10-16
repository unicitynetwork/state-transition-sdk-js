# Provenance

`vectors.json` is vendored byte-identical (sha256 `14b5f068d744ed2ccfdcb96662f8a169b384e8cf0d7040ce5d14bfc60f0516cd`)
from `unicitynetwork/bft-go-base` `uc-consolidation` commit `eeedaa7` (20 primitive, 18 recovery, 10 seal cases),
path `testdata/signature-recovery/v1/vectors.json`.

Do not edit. Re-vendor (and update this file) when dev-base extends the corpus. Rule (arch-o3.md §4): 65-byte `r||s||v`,
low-S, `v` in 0..3, the key recovered with `v` must equal the trusted key.
