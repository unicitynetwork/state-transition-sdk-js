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

| Network | Gateway | Network ID |
| --- | --- | --- |
| Mainnet | `https://gateway.mainnet.unicity.network` | `1` |
| Testnet2 | `https://gateway.testnet2.unicity.network` | `4` |

**Trust base.** Verification now runs against a `TrustBaseHistory`: the Unicity Trust Base entries (tag 39000, loaded from a one-entry or complete bundle, tag 39015) from a genesis entry whose entry id you pin, each later entry signed by a quorum of its predecessor. The single-record JSON trust base (`RootTrustBase`, `bft-trustbase.*.json`) is no longer read, and there is no compatibility wrapper. This release carries the genesis trust base of mainnet (network 1) and testnet2 (network 4) as its release table (`RELEASE_PINS`, generated from `release-pins/manifest.json` and the bundles beside it, which are the files of unicitynetwork/unicity-ids PR 11); `TrustBaseSession.openPublic(network, store)` opens either, verifies the embedded history strictly and extends it from the aggregator. Any other network needs a bundle of your own deployment (below). The table is regenerated, never edited: `node scripts/release-pins/generate.mjs` after `npm run build`, and CI fails when the generated file differs. A verification whose seal is from an epoch the history lacks fails with the typed `NoTrustBaseEntryResult` (find it in the result with `findNoTrustBaseEntry`).

Pass your gateway API key as the second argument to `AggregatorClient`. The shared public testnet2 demo key is `sk_ddc3cfcc001e4a28ac3fad7407f99590` ([source](https://github.com/unicity-sphere/sphere-sdk/blob/main/README.md#api-key)). Shared capacity may be limited; use your own key for sustained testing. Use your own mainnet key obtained from https://sphere.unicity.network/ and keep it secure.

### Local network

To test against your own deployment, take the bundle your aggregator serves (`GET /api/v1/trustbases?from=<genesis epoch>`, the complete answer from the genesis entry to the tip, tag 39015) and pass it as it is; nothing else needs spelling out:

```js
import { TrustBaseSession } from '@unicitylabs/state-transition-sdk/lib/api/bft/trustbase/TrustBaseSession.js';
import { MemoryTrustBaseStore } from '@unicitylabs/state-transition-sdk/lib/api/bft/trustbase/TrustBaseStore.js';

const bundle = new Uint8Array(await (await fetch(`${aggregatorUrl}/api/v1/trustbases?from=1`)).arrayBuffer());
const { session } = await TrustBaseSession.openLocal(bundle, new MemoryTrustBaseStore());
```

The network, the genesis and tip entries and the digest are taken from the bundle, which you trust because it is yours; it is still checked strictly (every entry signed by a quorum of its predecessor). A bundle that is not complete (a continuation cursor, a refused request, not starting at the genesis entry) is `ReleasePinInvalidError`. The cache of a local network lives under the fixed namespace `local`, apart from the public networks, and later entries are fetched and verified like any other. There is no release table lookup and no lineage check against a public network.

### First connection

Save this as `connect.mjs` and run `node connect.mjs`:

```js
import { AggregatorClient } from '@unicitylabs/state-transition-sdk/lib/api/AggregatorClient.js';
import { NetworkId } from '@unicitylabs/state-transition-sdk/lib/api/NetworkId.js';
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

const networkId = NetworkId.TESTNET2; // network ID 4

// Prepare a fresh state to query; no transaction is submitted.
const recipient = SignaturePredicate.fromSigningService(SigningService.generate());
const transaction = await MintTransaction.create(networkId, recipient);
const response = await client.getInclusionProof(await StateId.fromTransaction(transaction));

console.log('Network ID:', networkId.id);
console.log('State certified:', response.inclusionProof !== null);
```

This read-only probe should print `State certified: false` for the fresh state. It checks connectivity; it does not verify a token.

The trust-base history identifies the Consensus Layer (BFT Core) instance. Pin the genesis entry id in your application for production. Use the network id of your gateway when creating tokens (`trustBase.networkId` once the history holds an entry); testnet2 is network ID `4`, `NetworkId.TESTNET2` (mainnet is `NetworkId.MAINNET`, `1`). The old testnet, network 2, has no constant any more.

## Work with tokens

The SDK handles cryptography and token encoding. Your application manages keys, stores tokens, and delivers them to recipients over your chosen transport.

| Task | SDK entry points | Repository example |
| --- | --- | --- |
| Mint a token | `MintTransaction.create()`, `Token.mint()` | [Mint](./tests/examples/mint/ExampleTest.ts) |
| Transfer ownership | `TransferTransaction.create()`, `token.transfer()` | [Transfer](./tests/examples/transfer/ExampleTest.ts) |
| Split a fungible token | `TokenSplit.split()` | [Split](./tests/examples/split/ExampleTest.ts) |
| Verify a received token | `token.verify(verificationContext)` | [Receive and verify](./tests/examples/transfer/ExampleTest.ts) |

For minting and transfers, create the transaction, submit its `CertificationData` with `client.submitCertificationRequest()`, and check the response status. Obtain the verified unicity proof with the standalone `waitInclusionProof(client, trustBase, predicateVerifier, unicityCertificateVerifier, transaction)` function from `@unicitylabs/state-transition-sdk/lib/util/InclusionProofUtils.js`, then use `transaction.toCertifiedTransaction()` and `Token.mint()` or `token.transfer()` to produce the updated token. These API methods use the name `InclusionProof` for the proof object.

`waitInclusionProof` stops early with `InclusionProofExpiredError` or `InclusionProofUnknownError` when the aggregator reports that it dropped the request or does not know it. The request can then be submitted again. By default `waitInclusionProof` also long-polls: the aggregator holds each request open while the state is pending, so the proof arrives soon after certification. Servers without long polling are polled every `intervalMs`. An overload answer (HTTP 503 or 429, JSON-RPC `-32006`, or an error with `data.retryable: true`) is not a failure: the wait pauses `max(intervalMs, Retry-After)` (at most 60 s) and then polls plainly without `waitMs`, or fails at once with a `SleepError` caused by the overload error if that pause does not fit the remaining budget. A transport-level failure of a proof read inside the wait (refused or reset connection, stale keep-alive socket, truncated response) is inconclusive too: plain reads at the interval within the original budget; TLS certificate/hostname failures, invalid URLs and aborts stay terminal, submissions are never retried and a single call still throws. HTTP 502 and 504 inside the wait are treated the same way (status counts even when the body is not JSON or is oversized; single calls still throw), `Retry-After` may be delay-seconds or an HTTP-date, and an answer that does not carry the request id is terminal unless it is an overload. See the [API reference](./unicity-token-protocol-spec.md#12-typescript-sdk-api-reference) for the options and errors.

The linked examples are tests in a repository checkout, not files shipped in the npm package. Their helper imports and permissive issuance policies are for demonstrations. To adapt them:

- Change the gateway to the network's HTTPS URL and pass the key as the second argument to `new AggregatorClient(...)` in the example source; `config.json` has no API-key field. Do not add a key while keeping the local HTTP URL.
- Load the matching trust-base history and replace `NetworkId.LOCAL` with `trustBase.networkId`.
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

### Proof consolidation

Each transaction in a token's history has its own unicity proof, usually certified in a different round. Verifying the history inside a constrained environment, such as a smart contract or a zkVM guest, means authenticating every one of those certificates. `TokenProofClient.consolidate(token)` fetches new proofs for the token's history so that they share one unicity certificate, which then has to be authenticated only once. It is optional and the SDK never calls it on its own. See the [consolidation example](./tests/examples/consolidation/ExampleTest.ts) and the [API reference](./unicity-token-protocol-spec.md#122-proof-consolidation).

### Non-inclusion proofs

A non-inclusion proof shows that a state ID was absent from the aggregator's state tree at one certified snapshot. It does not show that the state is absent now or that a token can be spent. `AggregatorClient.getNonInclusionProof(stateId)` fetches the proof, and `verifyNonInclusion(proof, context)` verifies it and returns the authenticated snapshot. Before relying on the result, compare the snapshot's network and round with a checkpoint your application trusts independently. See the [API reference](./unicity-token-protocol-spec.md#124-non-inclusion-proofs).

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
