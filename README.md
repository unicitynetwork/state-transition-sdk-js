# Unicity State Transition SDK

Build applications that mint, transfer, and verify digital assets on the Unicity Network. This **TypeScript/JavaScript** SDK gives you control over tokens, ownership rules, and payments, with cryptographic verification built in.

Unicity combines private, off-chain token transactions with network-backed protection against double-spending. Token data stays with the parties you share it with, while unicity proofs let recipients verify that assets are spent only once. The network is designed to scale horizontally as demand grows.

- **Create digital assets:** mint tokens with your own types and application data payload.
- **Move value:** transfer tokens and split fungible tokens for payments.
- **Verify locally:** validate token history and unicity proofs against the compact trust base.
- **Build your way:** choose ownership predicates, issuance policies, storage, and delivery channels.
- **Use TypeScript throughout:** work with typed SDK objects for signing, verification, and serialization.

## Installation

Requires Node.js 22 or later for Node.js applications. The SDK is also usable in browser applications.

```bash
npm install @unicitylabs/state-transition-sdk
```

Import SDK classes from their `lib/...` paths, as shown below; the package has no root export.

## Unicity Network

Mainnet is live. Start with testnet2, for production use the mainnet gateway and matching trust base.

| Network | Gateway | Network ID | Trust base |
| --- | --- | --- | --- |
| Mainnet | `https://gateway.mainnet.unicity.network` | `1` | [JSON](https://raw.githubusercontent.com/unicitynetwork/unicity-ids/main/bft-trustbase.mainnet.json) |
| Testnet2 | `https://gateway.testnet2.unicity.network` | `4` | [JSON](https://raw.githubusercontent.com/unicitynetwork/unicity-ids/main/bft-trustbase.testnet2.json) |

Pass your gateway API key as the second argument to `AggregatorClient`. The shared public testnet2 demo key is `sk_ddc3cfcc001e4a28ac3fad7407f99590` ([source](https://github.com/unicity-sphere/sphere-sdk/blob/main/README.md#api-key)). Shared capacity may be limited; use your own key for sustained testing. Use your own mainnet key obtained from https://sphere.unicity.network/ and keep it secure.

### First connection

Download the testnet2 trust base once into your working directory:

```bash
curl --fail --location --output bft-trustbase.testnet2.json \
  https://raw.githubusercontent.com/unicitynetwork/unicity-ids/main/bft-trustbase.testnet2.json
```

Save this as `connect.mjs` and run `node connect.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { AggregatorClient } from '@unicitylabs/state-transition-sdk/lib/api/AggregatorClient.js';
import { RootTrustBase } from '@unicitylabs/state-transition-sdk/lib/api/bft/RootTrustBase.js';
import { StateId } from '@unicitylabs/state-transition-sdk/lib/api/StateId.js';
import { SigningService } from '@unicitylabs/state-transition-sdk/lib/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '@unicitylabs/state-transition-sdk/lib/predicate/builtin/SignaturePredicate.js';
import { StateTransitionClient } from '@unicitylabs/state-transition-sdk/lib/StateTransitionClient.js';
import { MintTransaction } from '@unicitylabs/state-transition-sdk/lib/transaction/MintTransaction.js';

const aggregator = new AggregatorClient(
  'https://gateway.testnet2.unicity.network',
  'sk_ddc3cfcc001e4a28ac3fad7407f99590', // Public testnet2 key
);
const client = new StateTransitionClient(aggregator);

const trustBase = RootTrustBase.fromJSON(
  JSON.parse(await readFile('bft-trustbase.testnet2.json', 'utf8')),
);

// Prepare a fresh state to query; no transaction is submitted.
const recipient = SignaturePredicate.fromSigningService(SigningService.generate());
const transaction = await MintTransaction.create(trustBase.networkId, recipient);
const response = await client.getInclusionProof(await StateId.fromTransaction(transaction));

console.log('Network ID:', trustBase.networkId.id);
console.log('State certified:', response.inclusionProof !== null);
```

This read-only probe should print `State certified: false` for the fresh state. It checks connectivity; it does not verify a token.

The trust base identifies the Consensus Layer (BFT Core) instance. Pin a trusted copy in your application for production. Use `trustBase.networkId` when creating tokens so they match your gateway; testnet2 is network ID `4` (`NetworkId.TESTNET` is `2`). For offline construction, use `NetworkId.fromId(4)`.

## Work with tokens

The SDK handles cryptography and token encoding. Your application manages keys, stores tokens, and delivers them to recipients over your chosen transport.

| Task | SDK entry points | Repository example |
| --- | --- | --- |
| Mint a token | `MintTransaction.create()`, `Token.mint()` | [Mint](./tests/examples/mint/ExampleTest.ts) |
| Transfer ownership | `TransferTransaction.create()`, `token.transfer()` | [Transfer](./tests/examples/transfer/ExampleTest.ts) |
| Split a fungible token | `TokenSplit.split()` | [Split](./tests/examples/split/ExampleTest.ts) |
| Prepare a token for EVM / zkVM verification (explicit, optional) | `TokenProofClient.consolidate()` | [Consolidation](./tests/examples/consolidation/ExampleTest.ts) |
| Verify a received token | `token.verify(verificationContext)` | [Receive and verify](./tests/examples/transfer/ExampleTest.ts) |

For minting and transfers, create the transaction, submit its `CertificationData` with `client.submitCertificationRequest()`, and check the response status. Obtain the verified unicity proof with the standalone `waitInclusionProof(client, trustBase, predicateVerifier, unicityCertificateVerifier, transaction)` function from `@unicitylabs/state-transition-sdk/lib/util/InclusionProofUtils.js`, then use `transaction.toCertifiedTransaction()` and `Token.mint()` or `token.transfer()` to produce the updated token. These API methods use the name `InclusionProof` for the proof object.

The linked examples are tests in a repository checkout, not files shipped in the npm package. Their helper imports and permissive issuance policies are for demonstrations. To adapt them:

- Change the gateway to the network's HTTPS URL and pass the key as the second argument to `new AggregatorClient(...)` in the example source; `config.json` has no API-key field. Do not add a key while keeping the local HTTP URL.
- Load the matching trust base and replace `NetworkId.LOCAL` with `trustBase.networkId`.
- Replace `new TokenIssuanceVerifierService(false)` with `new TokenIssuanceVerifierService()` and register your application's issuance verifier for each accepted token type. The demo setting accepts unregistered types without an issuance-policy check.

For transfers, obtain the recipient's ownership predicate through your application's address or delivery channel before creating the transaction.

### Store, send, and receive

Use `token.toCBOR()` to save or send a token, and `Token.fromCBOR(bytes)` to load it. Verify received tokens with your application's `VerificationContext` before accepting them:

```ts
import { Token } from '@unicitylabs/state-transition-sdk/lib/transaction/Token.js';
import { VerificationStatus } from '@unicitylabs/state-transition-sdk/lib/verification/VerificationStatus.js';

// `bytes` comes from your storage or transport; see the examples for context setup.
const receivedToken = await Token.fromCBOR(bytes);
const result = await receivedToken.verify(verificationContext);
if (result.status !== VerificationStatus.OK) {
  throw new Error(`Token verification failed: ${result.status}`);
}
```

### Proof status hints (pending / expired / unknown)

An aggregator can tell, next to an empty proof, what it knows about the request. Ask with
`getInclusionProof(stateId, { includeStatusHint: true })` (the wire parameter is `includeStatus`): an aggregator that supports it
answers `{ proof, status }`, `proof` is the unchanged result and `response.statusHint` carries the hint (`included`, `pending`,
`expired` or `unknown`; `null` for a server that sends a plain string, which is the legacy behavior, or for a value this SDK does
not know). Without the option the request and the result are exactly as before.

**A hint is not a verdict and not evidence.** It is unauthenticated: not signed, not part of any proof, and it never changes how
a proof, token or transaction is verified (a proof that is present is verified whatever the hint says). `unknown` or `expired`
is **not** a proof of absence and must never be used to conclude that a state is unspent. That is why every identifier says
*hint*, and why `response.status` does not exist (`CertificationResponse.status` is the authoritative result of a call).

`waitInclusionProof(client, trustBase, predicateVerifier, certificateVerifier, transaction, options?)` asks for the hint
(`{ signal, intervalMs, statusHints, unknownGraceMs }`; the positional `(signal, interval)` form of 3.0 still works and
behaves exactly as in 3.0). `pending` keeps waiting. `expired` fails at once with `InclusionProofExpiredError` and `unknown`
fails with `InclusionProofUnknownError` once it has persisted for a grace period (default two intervals), because a wait that
starts right after submission can reach an HA instance that has not seen the request yet. Pass `statusHints: false` to get the
3.0 behavior exactly (the wait ends with a proof, an error or the signal, and no hint is requested or acted on).

**Long poll.** The options form also asks the aggregator to hold each request while the state is pending (`waitMs`), which
means fewer requests and a faster answer after certification. The wait is sized from the time left: `timeoutMs` is an explicit
total budget (default 10s when there is neither a `signal` nor a `timeoutMs`); a bare `signal` says nothing about the time left,
so the preferred 20s window is asked for and the wait stops when the signal fires. `longPoll: false` polls exactly like 3.0;
`longPoll: { windowMs, marginMs }` tunes it. The aggregator's echo (`response.waitedMs`) is unauthenticated metadata: it never
extends a deadline, never replaces proof verification, and a missing or zero echo only means normal paced polling for the rest
of that call (nothing is cached). Low level: `getInclusionProof(id, { waitMs })` and `getInclusionProofs(ids, { waitMs })`
(latest view only; a server that rejects the unknown field with the generic `malformed_params` gets one repeat without it,
`batch.requests === 2`). `consolidate(token, { masterLongPoll: true })` (or `{ windowMs, marginMs }`) opts in to one wait on the master's latest request. An invalid `waitMs` is a `RangeError` on `getInclusionProof`, a `BatchProofError` (`rejected`) on `getInclusionProofs` and a `ConsolidationError` (`input`) for consolidation: each surface keeps its own error type.

All waiting errors extend `InclusionProofWaitError` (`code`: `expired` | `unknown` | `conflict`, `resubmittable`, `stateId`);
the hint-driven ones also extend `InclusionProofStatusError` with the literal `status`. After `expired` or `unknown` the same
signed request may be submitted again. Resubmitting a request that is still pending never creates a second leaf. The Mongo
backed queue rejects the copy with a duplicate key error on the **state id** (a Redis backed one accepts and drops it), which
only says that *a* request for this state id is queued, not that it is yours: a different transaction for the same state is
rejected the same way, and the queued one is certified. `submitCertificationRequest` therefore returns the SDK-classified status
`STATE_ID_QUEUED` for that error (a heuristic match on the server's error text for the `stateId` index) with `isAccepted ===
false`: wait for the proof and compare. `waitInclusionProof` throws `InclusionProofConflictError` (`resubmittable === false`,
still an `Error` with the legacy message text) when the proof served for the state certifies another request; that proof is
`unverifiedInclusionProof`, not yet authenticated. `ALREADY_SUBMITTED` (`isAccepted === true`) is only taken from a server that
has compared the queued request with yours; the SDK never infers it. Other errors, including other internal errors, still throw.

**What to do with a consolidation reason** (`ConsolidationResult` with `status: 'unavailable'`):

| reason | meaning | action |
|---|---|---|
| `pending_publication` | the master view is behind the token's proofs, or no finalized view yet | retry later (`retryable`) |
| `state_pending` | a shard accepted a request of the token and has not certified it | retry later (`retryable`) |
| `state_expired` | a shard dropped a request of the token before inclusion | do not retry; resubmit the request if it is yours |
| `state_unknown` | a shard does not know a request of the token (misrouted, lost, restarted, other instance) | do not retry blindly; check routing and the endpoint; hints are not evidence |
| `state_not_in_root` | the state is not a leaf of the root the master view commits to | do not retry; routing or input problem |
| `target_not_retained`, `busy`, `partition_view_unavailable` | the service cannot serve this attempt now | retry a new attempt later (`retryable` as sent) |
| `unsupported_capability`, `unsupported_configuration`, `limit_exceeded` | the endpoint or the token cannot use this API | do not retry |

Note that `unknown` is a transient answer for a *wait right after submission* (grace period) but not for consolidation, where
the original proofs already exist.

**Upgrading notes (new in this release line):** `waitInclusionProof` can now reject earlier with `InclusionProofExpiredError` /
`InclusionProofUnknownError` (opt out with `statusHints: false`), `CertificationStatus` has two more members
(`STATE_ID_QUEUED`, `ALREADY_SUBMITTED`: exhaustive `switch` statements over it need a case) and `submitCertificationRequest`
returns `STATE_ID_QUEUED` where it used to throw on that duplicate key error.

### Prepare a token for EVM or zkVM verification

`TokenProofClient.consolidate(token, { timeoutMs, signal })` rebuilds the replaceable outer-history proofs of a token so
that they share one unicity seal, which lets a verifier that authenticates that seal once reuse the result. It is
**explicit and never automatic**: no mint, transfer, send, receive, import, export, serialization or verification calls
it, and there is no `auto` policy. It needs no signing key, submits nothing and never modifies its input. It needs
`get_inclusion_proofs.v1` on every participating shard (a client without it yields `unavailable`, single-proof calls are
never emulated) and a trusted `ShardRouting` configured once. The result is `consolidated` with a newly verified token, or
`unavailable` with a stable reason and retryability hint; cancellation, deadline, transport, server, response and integrity
failures are thrown as `ConsolidationError` and are never reported as unavailability. Proofs nested in signed mint
justifications, split/burn dependencies and predicate data stay byte for byte unchanged and may need other seals; tokens do
not get smaller. The target verifier (contract, zkVM guest) must authenticate the seal itself, a host verdict is not evidence.
An unsharded partition (a routing with the empty shard id and an empty scheme) needs no partition view: the latest response
may omit it and the authenticated certificate itself is the target (one request, no exact-root requests). That holds only
for the empty shard with an empty shard path under the same pins, path and strict seal authentication; a sharded partition
without its view stays `unavailable` (`partition_view_unavailable`), and there is no option to relax it.
See the [consolidation example](./tests/examples/consolidation/ExampleTest.ts).

### Non-inclusion (absence at a certified snapshot)

`AggregatorClient.getNonInclusionProof(stateId, { signal })` calls `get_non_inclusion_proof.v1` once (no polling) and returns
either an unverified `NonInclusionProof` (bound to the state you asked about, never read from the wire) or
`{ kind: 'state_included_hint' }`, the service's **unauthenticated** claim that the state is included (ask for an inclusion
proof and verify that). `verifyNonInclusion(proof, { trustBase, unicityCertificateVerifier }, { expectedPartition, minRound?,
nextEpochStartRound?, shardConfigurationHash? })` authenticates the unicity certificate (empty shard id and path, partition,
strict seal authentication: network, exact epoch, epoch start, quorum) and the state tree path, and returns a
`VerificationResult` whose `absence` (`VerifiedAbsence`, only obtainable there) says the state was **absent at that round's
snapshot**. That is a historical fact: not current absence and not spendability. An authenticated snapshot older than
`minRound` is `stale`, never accepted. Failures of the request are one `NonInclusionProofError` (`kind`, `retryable`; on
cancellation `cause` is your `signal.reason`); the same service codes (`-32020` unavailable, `-32022` included claim,
`-32023` busy) are recognized over HTTP 200, 404, 409 and 429. `fetchMembershipEvidence` is two independent calls, not atomic,
and returns unverified evidence. The shared corpus is `tests/fixtures/non-inclusion/v1` (from aggregator-go).

## Security

Unicity Proofs provide independently verifiable evidence of certified state transitions being unique, backed by the network's Byzantine fault tolerant consensus. Together with ownership verification, they protect against double-spending without publishing token contents to a public ledger.

Use the SDK's verification APIs with the correct network trust base and your application's token issuance policies. A token's cryptographic validity and whether your application accepts its issuer are separate checks; register accepted token types with `TokenIssuanceVerifierService`. Keep private keys and token backups secure, and check that received tokens belong to the intended recipient.

## Development

From a repository checkout:

```bash
npm ci
npm run build
npm test
npm run lint
```

Additional test suites:

- `npm run test:examples` — mint, transfer, and split examples; requires the local aggregator configured in each example's `config.json` and the matching `tests/examples/trust-base.json`.
- `npm run test:integration` — starts an isolated network with Testcontainers; requires Docker.
- `npm run test:e2e` — exercises a deployed network using the configuration below.

```bash
AGGREGATOR_URL=https://gateway.testnet2.unicity.network \
TRUST_BASE_PATH=/path/to/bft-trustbase.testnet2.json \
AGGREGATOR_API_KEY=sk_ddc3cfcc001e4a28ac3fad7407f99590 \
npm run test:e2e
```

## Resources

- [Unicity Network](https://github.com/unicitynetwork/)
- [Repository examples](./tests/examples)
- [Protocol documentation](./unicity-token-protocol-spec.md)
- [Report an issue](https://github.com/unicitynetwork/state-transition-sdk-js/issues)

## License

[MIT](./LICENSE)
