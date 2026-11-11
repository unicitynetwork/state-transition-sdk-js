# Real seals of the existing networks, verified through the V2 bundles

Vendored byte-identical from sdk-rust `dev2/utb-real-seal` (9e92ae2), `tests/vectors/real-seals/`; the JS test is `tests/unit/api/RealSealsTest.ts`. The text below is the Rust README.

Owner §44/§46: the V2 bundle file describes the live authority. For testnet2 (network 4) and mainnet (network 1), a seal signed by the live validators verifies through
`unicity-trustbase.<network>.cbor` (the one-entry V2 bundle of the unicity-ids genesis; EntryIDs testnet2 `4b49eb2b…f37f`, mainnet `0b6f8143…4e4c`, as pins).

- `unicity-trustbase.<network>.cbor`: the bundle, byte-identical to the converter output (`cmd/trustbase-bundle`, ristik/bft-go-base `utb/bundle-converter`) from the unicity-ids JSON.
- `<network>.non-inclusion.hex`: the `result` of the network's public gateway for `get_non_inclusion_proof.v1` (`https://gateway.<network>.unicity.network/`, JSON-RPC, **no API key**; reads
  need no credential) for the random state id in `<network>.stateid.hex`, fetched 2026-11-05. A non-inclusion proof carries a real unicity certificate. Nothing in the file was edited.
- Both networks answer for a shard (testnet2: 3 bits, mainnet: 2 bits); the test pins the shard the gateway answered for, which the verifier checks is a prefix of the state id.
- Seals are epoch 1 on both networks (testnet2 round 19235148, mainnet round 21908895 at fetch time).

What it shows: the live seals authenticate under the V2 genesis (same members, keys and quorum as V1, epoch 1). What it does not show: nothing on these networks signs V2 entries yet; epoch 2 as a V2 entry comes with the root cutover.

Refetch (read-only):

    curl -s -X POST https://gateway.testnet2.unicity.network/ -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"get_non_inclusion_proof.v1","params":{"stateId":"<64 hex>"}}'
