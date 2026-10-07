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
