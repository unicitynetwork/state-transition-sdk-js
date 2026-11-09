# Non-inclusion corpus v2 (`testdata/non-inclusion/v2`)

**Schema 2** (replaces v1: the result is a discriminated snapshot result, the partition is the fixed aggregation partition
7, and there is no freshness option or `stale` verdict; see "Result" and "Changes from v1"). Shared by aggregator-go,
state-transition-sdk-js, state-transition-sdk-rust and rugregator. The directory is
copied byte for byte; `manifest.json` lists the SHA-256 of every file. It is generated deterministically by
`go run ./cmd/gen-ni-fixtures` (aggregator-go) from an **independent reference model** (`internal/nifixture`:
plain recursive radix tree, no code shared with the production trees) and from the bft-core test-only UC producer
(`rootchain/testutils/ucfixture`, public deterministic test keys). Nothing here is a production credential.

## What is proved

> Non-inclusion proves absence only at the authenticated snapshot returned by verification. It does not prove absence now, continuous absence, or that a token can be spent. Compare the snapshot’s network and root round (or its certified seal timestamp under your application’s time policy) with an independently trusted requirement. The seal timestamp is a consensus-certified time, not proof of real-time freshness. Do not use unverified response metadata for this check.

`get_non_inclusion_proof.v1` proves absence of one state key **at one certified snapshot**: the authenticated
terminal leaf reached by walking the query at every actual junction of the compressed radix tree is a different
leaf. Pending, expired and unknown states are cryptographically indistinguishable from absent ones at a root.

## Result (schema 2)

High-level verification returns a discriminated result, never a boolean:

| Outcome | Payload |
|---|---|
| `absent_at_snapshot` | the queried `stateId` and the authenticated `snapshot` |
| `included_at_snapshot` | the queried `stateId` and the authenticated `snapshot`, only after a valid path proves that exact key present |
| `rejected` | one rejection class (`malformed`, `uc_invalid`, `authority_rejected`, `certificate_invalid`); **no snapshot metadata** |

`snapshot` is read from the authenticated UC and input record, never from the RPC block number or receipt time:

| Field | Source | JSON |
|---|---|---|
| `networkId` | seal | number |
| `partitionId` | unicity tree certificate (always 7) | number |
| `shardId` | shard tree certificate; bit string, `""` for the unsharded partition | string |
| `rootRound` | seal root chain round | decimal string (uint64) |
| `sealTimestampSeconds` | seal timestamp, Unix seconds | decimal string (uint64) |
| `rootEpoch` | seal epoch | decimal string (uint64) |
| `shardRound` | input record round | decimal string (uint64) |
| `shardEpoch` | input record epoch | decimal string (uint64) |
| `stateRoot` | input record hash, hex; **null** for the certified empty tree | string or null |

Nothing of the snapshot is exposed before the shape, the trusted network/authority/epoch interval, the partition and
shard commitments, the query binding and the complete state-tree relation are authenticated. A result owns copies of
its byte fields. Freshness is a decision of the caller after verification (`policy.json`); the verifier has no
freshness option and no `stale` verdict.

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

## Verification order (`nifixture.Verdict`) and rejection classes

1. wrapper/certificate/UC decoding in the exact profile, UC canonical re-encoding equal: `malformed`
2. UC body: components present, no null path entries, structure valid for **the fixed aggregation partition 7** and the
   context's shard (the empty shard ID has no shard-tree siblings; a sharded context requires the UC of exactly that
   shard with its complete shard path), optional shard configuration pin, shard and partition paths reach the seal
   hash: `uc_invalid`. A validly signed UC of another partition is `uc_invalid`. A proof never selects its partition.
3. seal authenticated by the trusted authority: network, exact epoch, not before the epoch start, before the
   authenticated end of the epoch when known, quorum signatures over the complete seal: `authority_rejected`
4. shard membership (sharded context): the query and the authenticated terminal key belong to the shard
   (`certificate_invalid` otherwise)
5. relation above: `certificate_invalid`, or the outcomes `included_at_snapshot` / `absent_at_snapshot` (success, with the snapshot)

Contexts (`contexts.json`) hold everything the verifier trusts: the authority (`trustBaseBundle`, a path under `authority/`: a complete
Unicity Trust Base v2 bundle, tag 39015, holding the one genesis entry of the authority; a verifier opens it as a trust base history pinned to
that genesis), the expected `shard` (bit string), optional `nextEpochStart`
(authenticated end boundary) and optional `shardConfHash` pin. There is no partition and no minimum root round in a
context. Numbers are decimal strings. A signed old snapshot establishes historical absence; whether it is good enough is the
caller's policy.

## Files

* `cases/*.json` positives (`absent_at_snapshot` and `included_at_snapshot`, unsharded, empty tree, sharded, large uint64 values, same-seal pairs, historical snapshots): tree leaves, query, root (`""` = empty tree), raw certificate (`""` = empty), UC hex, full wrapper, context, expected outcome with `stateId` and `snapshot`.
* `negative/*.json` single-fault derivations (`base`): the wrapper bytes under test and the expected result (`rejected` with a class and no snapshot; a few context variants are successes and say so).
* `policy.json`: caller policy examples (checkpoint vs snapshot: network, root round, seal timestamp, large uint64 values, cross network). Applied after verification; not part of the verifier.
* `sequences.json`: ordered verifications on ONE verifier (it memoizes authenticated seals): a seal shared by two shards, rejections between successes, repeated verification. Each step has its own expected result.
* `authority/*.cbor` the authorities as trust base v2 bundles (one genesis entry each); `contexts.json`.
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
leaves (memory and disk trees). Outcomes `absent_at_snapshot` and `included_at_snapshot` must match exactly, including
`stateId` and every snapshot field. For a rejection the result must be a rejection, carry **no snapshot metadata**, and
its class must equal `expected.rejection` or one of `expected.acceptable`; strict decoders legitimately stop at
an earlier stage (for example a null path step is `malformed` for a strict decoder and `uc_invalid` for a lenient one),
and a decoder must never be loosened to reach a later class. Signatures and block numbers may differ in other producers;
compare outcomes and snapshots there. JS reads uint64 fields as `bigint`, Rust/Go as `u64`/`uint64`.

## Changes from v1

* `expected.verdict` is replaced by `expected.outcome` (+ `stateId`, `snapshot`) or `expected.rejection`; `state_included`
  is the successful outcome `included_at_snapshot`, `absent` is `absent_at_snapshot`.
* `stale` and `minRootRound` are removed (cases `ctx-too-stale`, `ctx-fresh-enough`): see `policy.json`.
* The partition is the constant 7 (`api.AggregationPartitionID`, JS `AGGREGATION_PARTITION_ID`, Rust `AGGREGATION_PARTITION_ID`);
  contexts have no `partition` (cases `ctx-wrong-partition` replaced by the validly signed `uc-wrong-partition-*`).
* New: sharded positives (absent, included, empty tree, several shards, same-seal pairs), shard negatives, large uint64
  snapshot values, historical snapshot pair, `policy.json`, `sequences.json`.

Provenance: `manifest.json` records the aggregator-go commit which contains the generator and the bft-core / bft-go-base
module versions (they determine every UC and signature byte).

Known gap: the seal verifier of bft-go-base ignores the secp256k1 recovery id (65th signature byte); no vector pins it.
