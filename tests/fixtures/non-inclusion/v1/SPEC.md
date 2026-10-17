# Non-inclusion corpus v1 (`testdata/non-inclusion/v1`)

Shared by aggregator-go, state-transition-sdk-js, state-transition-sdk-rust and rugregator. The directory is
copied byte for byte; `manifest.json` lists the SHA-256 of every file. It is generated deterministically by
`go run ./cmd/gen-ni-fixtures` (aggregator-go) from an **independent reference model** (`internal/nifixture`:
plain recursive radix tree, no code shared with the production trees) and from the bft-core test-only UC producer
(`rootchain/testutils/ucfixture`, public deterministic test keys). Nothing here is a production credential.

## What is proved

`get_non_inclusion_proof.v1` proves absence of one state key **at one certified snapshot**: the authenticated
terminal leaf reached by walking the query at every actual junction of the compressed radix tree is a different
leaf. It does not prove current absence or spendability. Pending, expired and unknown states are
cryptographically indistinguishable from absent ones at a root.

## Bytes

RPC: `{"method":"get_non_inclusion_proof.v1","params":{"stateId":"<64 hex>"}}`, result is a **string**: the hex of

    [blockNumber: uint64, 39034([1, certificate: bstr, unicityCertificate: native tagged CBOR value])]

The UC is embedded as a CBOR value, not as a byte string. Integers are in shortest form. No trailing bytes. The
block number is unauthenticated metadata (ignore it for security decisions).

Certificate (`bstr`): empty = the certified empty tree; otherwise exactly

    bitmap[32] || sibling[32] * popcount(bitmap) || terminalKey[32] || terminalValue[32]

(length `96 + 32 * popcount`, at most 8288). Siblings are root to leaf; bitmap bit `d` (MSB first: bit 0 is the top
bit of byte 0) marks a junction at depth `d`. The query key is **not** in the wire; the client binds it locally.

Hashes (SHA-256): leaf `H(00 || key || value)`; node `H(01 || depth:u8 || region(terminalKey, depth) || left || right)`
where `region(k, d)` keeps bits `[0,d)` of `k` and clears the rest. Fold from the leaf towards the root over the
bitmap depths in decreasing order; at each junction the child on the terminal's side is the running hash.

## Relation (reference verifier `nifixture.Verify`)

1. Decode in the exact profile (any deviation: `malformed`).
2. For every bitmap depth the query bit equals the terminal key bit; otherwise `certificate_invalid`.
3. The fold reaches the root of the UC input record. **The certified empty tree is exactly the native input record
   hash `null` (CBOR `f6`), which is what BFT certifies for the initial record and its timeout repeats.** The empty byte
   string (`40`) is a different encoding and is **not** the empty tree (`uc_invalid`; vector
   `uc-empty-root-as-empty-byte-string`); the 32 byte all-zero hash is not an empty tree either. The empty certificate
   verifies only against the empty root, a nonempty certificate never does; otherwise `certificate_invalid`.
   Required SDK follow-up: every nullable input record field must decode `null` and re-encode it as `null` (`f6`).
   The genuine empty-tree input record is `8a 01 00 00 f6 f6 f6 00 f6 00 f6`: `previousHash`, **`hash` and
   `summaryValue`** are all `null` (an SDK which reads either as a byte string rejects the genuine UC). Re-encoding any
   `null` as `40` changes the input record bytes and so the shard-tree hash.
4. Terminal key == query: `state_included` (the authenticated leaf is the query). Otherwise absent.

## Verification order (`nifixture.Verdict`) and verdicts

1. wrapper/certificate/UC decoding in the exact profile, UC canonical re-encoding equal: `malformed`
2. UC body: components present, no null path entries, structure valid for the expected partition, **empty shard ID with
   no shard-tree siblings** (the unsharded UC; the partition path may be nonempty), optional shard configuration pin,
   shard and partition paths reach the seal hash: `uc_invalid`
3. seal authenticated by the trusted authority: network, exact epoch, not before the epoch start, before the
   authenticated end of the epoch when known, quorum signatures over the complete seal: `authority_rejected`
4. required minimum root round: `stale`
5. relation above: `certificate_invalid`, `state_included`, or `absent` (success)

Contexts (`contexts.json`) hold everything the verifier trusts: trust base (`authority/*.cbor`, and the same authority
as `authority/*.json` in the form the SDKs parse), expected partition, optional
`nextEpochStart` (authenticated end boundary), `minRootRound`, optional `shardConfHash` pin. Numbers are decimal
strings. A signed old snapshot can establish historical absence but never satisfies a newer `minRootRound`.

## Files

* `cases/*.json` positives: tree leaves, query, root (`""` = empty tree), raw certificate (`""` = empty), UC hex, full wrapper, context, expected verdict.
* `negative/*.json` single-fault derivations (`base`): the wrapper bytes under test and the expected verdict.
* `authority/*.cbor` trust bases; `contexts.json`.
* `direct-unsharded/latest.json`: tree, UC and raw inclusion certificates for the unsharded latest batch. The ordinary UC
  is the consolidation target; **no partition view exists or is sent** for it.
* `rpc-errors.json`: client classification of status codes and bodies. The RPC code decides for a valid
  envelope whatever the HTTP status: `-32020` unavailable (no certified snapshot), `-32022` state included at the
  selected root, `-32023` busy, `-32602` invalid params, `-32601`, `-32603`, other codes preserved. A body which
  is not a complete matching JSON-RPC 2.0 envelope (HTML, wrong id/version, result and error, neither) is a transport
  error, never absence evidence.
* `status-hints.json`: #209 spelling for latest batch absence: `data.detail` is `state_pending|state_expired|state_unknown`
  (precedence unknown > expired > pending), `data.indexes = {pending:[..],expired:[..],unknown:[..]}`, ascending,
  at most 256 in total; exact-root absence is `state_not_in_root`.

## Conformance

Implementations must reproduce, for every vector, exact certificate/wrapper bytes where they generate them from the
leaves (memory and disk trees). Verdicts: `absent` and `state_included` must match exactly. For a rejection the verdict
must be a rejection and equal `expected.verdict` or one of `expected.acceptable`; strict decoders legitimately stop at
an earlier stage (for example a null path step is `malformed` for a strict decoder and `uc_invalid` for a lenient one),
and a decoder must never be loosened to reach a later class. Signatures and block numbers may differ in other producers;
compare verdicts there.

Provenance: `manifest.json` records the aggregator-go commit which contains the generator and the bft-core / bft-go-base
module versions (they determine every UC and signature byte).

Known gap: the seal verifier of bft-go-base ignores the secp256k1 recovery id (65th signature byte); no vector pins it.
