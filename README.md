# State Transition SDK

An SDK for managing assets on the Unicity Protocol, supporting off-chain state with on-chain security guarantees.

## Overview

The State Transition SDK is a TypeScript library that provides an off-chain token transaction framework. Tokens are managed, stored, and transferred off-chain with only cryptographic commitments published on-chain, ensuring privacy while preventing double-spending through single-spend proofs.

In this system, tokens are self-contained entities containing complete transaction history and cryptographic proofs attesting to their current state (ownership, value, etc.). State transitions are verified through consultation with blockchain infrastructure (Unicity) to produce proof of single spend.

### Key Features

- **Off-chain Privacy**: Cryptographic commitments contain no information about tokens, their state, or transaction nature
- **Horizontal Scalability**: Millions of transaction commitments per block capability  
- **Zero-Knowledge Transactions**: Observers cannot determine if commitments refer to token transactions or other processes
- **Offline Transaction Support**: Create and serialize transactions without network connectivity
- **TypeScript Support**: Full type safety and modern development experience
- **Modular Architecture**: Pluggable address schemes, predicates, and token types

## Installation

```bash
npm install @unicitylabs/state-transition-sdk
```

## Quick Start

Note: for more complete examples, see further down in the [Examples section](#examples) or browse around in the [tests folder](./tests) of this SDK.

### Basic Usage

Minting

```typescript
// Create aggregator client
const aggregatorClient = new AggregatorClient('https://gateway-test.unicity.network:443');
const client = new StateTransitionClient(aggregatorClient);

const secret = crypto.getRandomValues(new Uint8Array(128)); // User secret key
const tokenId = TokenId.create(crypto.getRandomValues(new Uint8Array(32))); // Chosen ID
const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(32))); // Token type
const tokenData = new Uint8Array(0); /* Your own token data object with ISerializable attributes */
const coinData = TokenCoinData.create([/* [CoinId, value] elements to have coins in token */]);
const salt = crypto.getRandomValues(new Uint8Array(32)); /* Your random salt bytes */
const stateData = new Uint8Array()/* Your state data bytes */;

const nonce = crypto.getRandomValues(new Uint8Array(32)); /* Your random nonce bytes */
const signingService = await SigningService.createFromSecret(secret, nonce);
const predicate = await MaskedPredicate.create(tokenId, tokenType, signingService, HashAlgorithm.SHA256, nonce);
const recipient = await DirectAddress.create(data.predicate.reference);

const commitment = await client.submitMintTransaction(
  await MintTransactionData.create(
    tokenId,
    tokenType,
    tokenData,
    coinData,
    recipient.toString(),
    data.salt,
    await new DataHasher(HashAlgorithm.SHA256).update(data.data).digest(),
    null,
  ),
);

// Since submit takes time, inclusion proof might not be immediately available
const inclusionProof = await client.getInclusionProof(commitment);
const mintTransaction = await client.createTransaction(commitment, inclusionProof);

const token = new Token(await TokenState.create(data.predicate, data.data), mintTransaction, []);
```

Transfer

```typescript
const textEncoder = new TextEncoder();

// Create aggregator client
const aggregatorClient = new AggregatorClient('https://gateway-test.unicity.network');
const client = new StateTransitionClient(aggregatorClient);

// Assume you have a token object from previous minting
let token: Token;
// Sender secret
let secret: Uint8Array;

// Recipient address (obtained from recipient)
let recipient: string;
// Recipient 
let recipientDataHash: DataHash;

// secret is the secret key of the sender
const signingService = await SigningService.createFromSecret(secret, token.state.unlockPredicate.nonce);
const transactionData = await TransactionData.create(
  token.state,
  recipient,
  crypto.getRandomValues(new Uint8Array(32)),
  recipientDataHash,
  textEncoder.encode('user defined transaction message'),
  token.nametagTokens,
);

const commitment = await Commitment.create(transactionData, signingService);
const response = await client.submitCommitment(commitment);
if (response.status !== SubmitCommitmentStatus.SUCCESS) {
  throw new Error(`Failed to submit transaction commitment: ${response.status}`);
}

// Since submit takes time, inclusion proof might not be immediately available
const inclusionProof = await client.getInclusionProof(commitment);
const transaction = client.createTransaction(commitment, inclusionProof);

recipientToken = await client.finishTransaction(
  token,
  await TokenState.create(recipientPredicate, new TextEncoder().encode('my custom data')),
  transaction,
);
```

## Core Components

### StateTransitionClient

The main SDK interface for token operations:

- `submitMintTransaction()` - Create mint commitment and send to aggregator
- `submitCommitment()` - Submit transaction commitment to aggregator
- `createTransaction()` - Create transactions from commitments
- `finishTransaction()` - Complete token transfers
- `getTokenStatus()` - Check token status via inclusion proofs
- `getInclusionProof()` - Retrieve inclusion proof for a commitment

### Address System

**DirectAddress**: Cryptographic addresses with checksums for immediate ownership

To use address sent by someone:
```typescript
const address = await DirectAddress.fromJSON('DIRECT://582200004d8489e2b1244335ad8784a23826228e653658a2ecdb0abc17baa143f4fe560d9c81365b');
```

To obtain an address for minting, or for sending the address to someone, the address is calculated from a predicate reference. Such addresses add privacy and unlinkability in the case of the masked predicate:
```typescript
const address = await DirectAddress.create(MaskedPredicate.calculateReference(/* Reference parameters */));
console.log(address.toJSON()) // --> DIRECT://582200004d8489e2b1244335ad8784a23826228e653658a2ecdb0abc17baa143f4fe560d9c81365b
```

### Predicate System

Predicates define unlock conditions for tokens:

- **UnmaskedPredicate**: Direct public key ownership
- **MaskedPredicate**: Privacy-preserving ownership (hides public keys)
- **BurnPredicate**: One-way predicate for token destruction

```typescript
// Create an unmasked predicate for direct ownership
const unmaskedPredicate = UnmaskedPredicate.create(token.id, token.type, signingService, HashAlgorithm.SHA256, salt);

// Create a masked predicate for privacy
const maskedPredicate = await MaskedPredicate.create(
  token.id,
  token.type,
  signingService,
  HashAlgorithm.SHA256,
  nonce
);
```

### Token Types

**Fungible Tokens**: Standard value-bearing tokens

```typescript
const textEncoder = new TextEncoder();

const tokenData = TokenCoinData.create([
  [new CoinId(textEncoder.encode('ALPHA_COIN')), BigInt(1000)]
]);
```

### Transaction Flow

1. **Minting**: Create new tokens
2. **Transfer**: Submit state transitions between owners
3. **Completion**: Finalize transfers with new token state

#### Transfer flow

Prerequisites
Recipient knows some info about token, like token type for generating address.

```text
A[Start] 
A --> B[Recipient Generates Address]
B --> C[Recipient Shares Address And New Data Hash with Sender]
C --> D[Sender Creates Transaction Commitment]
D --> E[Sender Submits Transaction Commitment]
E --> F[Sender Retrieves Inclusion Proof]
F --> G[Sender Creates Transaction]
G --> H[Sender Sends Transaction and Token to Recipient]
H --> I[Recipient Imports Token and Transaction]
I --> J[Recipient Verifies Transaction]
J --> K[Recipient Finishes Transaction]
K --> L[End]
```

#### Offline Transfer flow

For situations where immediate network connectivity isn't available:

```text
A[Start] 
A --> B[Recipient Generates Address]
B --> C[Recipient Shares Address And New Data Hash with Sender]
C --> D[Sender Creates Transaction Commitment]
D --> E[Recipient Submits Transaction Commitment]
E --> F[Recipient Retrieves Inclusion Proof]
F --> G[Recipient Creates Transaction]
G --> H[Recipient Sends Transaction and Token to Recipient]
H --> I[Recipient Imports Token and Transaction]
I --> J[Recipient Verifies Transaction]
J --> K[Recipient Finishes Transaction]
K --> L[End]
```

## Architecture

### Token Structure

Tokens contain:
- **id**: Unique 256-bit identifier
- **type**: Token class identifier
- **version**: Token format version
- **predicate**: Current ownership condition
- **coins**: Coins of various types and amounts owned by this token (the coins can also represent tokens from other blockchains)
- **nametagTokens**: Name tags for addressing
- **data**: Token-specific data
- **transactions**: The history of transactions performed with this token

### Privacy Model
- **Commitment-based**: Only cryptographic commitments published on-chain
- **Self-contained**: Tokens include complete transaction history
- **Zero-knowledge**: No information leaked about token or transaction details
- **Minimal footprint**: Blockchain only stores commitment hashes

### Security Features
- **Double-spend prevention**: Enforced through inclusion proofs
- **Cryptographic verification**: All state transitions cryptographically verified
- **Predicate flexibility**: Multiple ownership models supported
- **Provenance tracking**: Complete audit trail in token history

## Development

### Building

```bash
npm run build
```

### Testing

Run unit and integration tests.
NB! Integration tests require docker to be installed.

```bash
npm test
```

Run unit tests only.

```bash
npm run test:unit
```

Run integration tests only.

```bash
npm run test:integration
```

Run end-to-end tests only.

```bash
AGGREGATOR_URL='https://gateway-test.unicity.network' npm run test:e2e
```

### Linting

Lint all code (source and tests):
```bash
npm run lint
```

Lint with auto-fix:
```bash
npm run lint:fix
```

## Network Configuration

- **Test Gateway**: `https://gateway-test.unicity.network`
- **Default Token Type**: Configurable via TokenType enum

## Examples

### Minting Tokens

Note that the examples here are using some utility functions and classes that are defined below in a separate section.

```typescript
// Create aggregator client
const aggregatorClient = new AggregatorClient('https://gateway-test.unicity.network:443');
const client = new StateTransitionClient(aggregatorClient);

const secret = crypto.getRandomValues(new Uint8Array(128)); // User secret key
const tokenId = TokenId.create(crypto.getRandomValues(new Uint8Array(32))); // Chosen ID
const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(32))); // Token type
const tokenData = new Uint8Array(0); /* Your own token data object with ISerializable attributes */
const coinData = TokenCoinData.create([/* [CoinId, value] elements to have coins in token */]);
const salt = crypto.getRandomValues(new Uint8Array(32)); /* Your random salt bytes */
const stateData = new Uint8Array()/* Your state data bytes */;

const nonce = crypto.getRandomValues(new Uint8Array(32)); /* Your random nonce bytes */
const signingService = await SigningService.createFromSecret(secret, nonce);
const predicate = await MaskedPredicate.create(tokenId, tokenType, signingService, HashAlgorithm.SHA256, nonce);
const recipient = await DirectAddress.create(predicate.reference);

const commitment = await client.submitMintTransaction(
  await MintTransactionData.create(
    tokenId,
    tokenType,
    tokenData,
    coinData,
    recipient.toString(),
    salt,
    await new DataHasher(HashAlgorithm.SHA256).update(stateData).digest(),
    null,
  ),
);

// Since submit takes time, inclusion proof might not be immediately available
const inclusionProof = await client.getInclusionProof(commitment);
const mintTransaction = await client.createTransaction(commitment, inclusionProof);

const token = new Token(await TokenState.create(predicate, stateData), mintTransaction, []);
```

### Token Transfer

This example begins after the previous example. Here we assume that the tokens have already been minted and we wish to send the tokens to a new recipient.

Note that the examples here are using some utility functions and classes that are defined below in a separate section.

```typescript
// Assume that token has already been minted or received and is available
let token: Token;
let senderSecret: Uint8Array; // Sender's secret key

// This secret belongs to the receiver that the token is sent to 
const receiverSecret = crypto.getRandomValues(new Uint8Array(32));

// Recipient prepares the info for the transfer using token ID and type from the sender.
const nonce = crypto.getRandomValues(new Uint8Array(32));
const receiverSigningService = await SigningService.createFromSecret(receiverSecret, nonce);
const recipientPredicate = await MaskedPredicate.create(
  token.id,
  token.type,
  receiverSigningService,
  HashAlgorithm.SHA256,
  nonce,
);

const recipient = await DirectAddress.create(recipientPredicate.reference);
const recipientDataHash = await new DataHasher(HashAlgorithm.SHA256).update(new TextEncoder().encode('my custom data')).digest();

// The sender creates the transfer transaction, using recipientPredicate.reference sent by the receiver
const salt = crypto.getRandomValues(new Uint8Array(32));
const senderSigningService = await SigningService.createFromSecret(senderSecret, token.state.unlockPredicate.nonce);

const transactionData = await TransactionData.create(
  token.state,
  recipient.toString(),
  salt,
  recipientDataHash,
  new TextEncoder().encode('my transaction message'),
  token.nametagTokens,
);

const commitment = await Commitment.create(transactionData, senderSigningService);
const response = await client.submitCommitment(commitment);
if (response.status !== SubmitCommitmentStatus.SUCCESS) {
  throw new Error(`Failed to submit transaction commitment: ${response.status}`);
}

// Since submit takes time, inclusion proof might not be immediately available
const inclusionProof = await client.getInclusionProof(commitment);
const transaction = await client.createTransaction(commitment, inclusionProof);

// The sender serializes the resulting transaction and sends it to the receiver
const transactionJson = TransactionJsonSerializer.serialize(transaction);
// The sender also serializes the token into JSON and sends it to the receiver
const tokenJson = token.toJSON();

const predicateFactory = new PredicateFactory();
const tokenFactory = new TokenFactory(new TokenJsonSerializer(predicateFactory));
const transactionSerializer = new TransactionJsonSerializer(predicateFactory);

// The receiver imports the token from the given JSON file
const importedToken = await tokenFactory.create(tokenJson);

// Recipient gets transaction from sender
const importedTransaction = await transactionDeserializer.deserialize(
  importedToken.id,
  importedToken.type,
  transactionJson,
);;

// The recipient finishes the transaction with the recipient predicate
const updateToken = await client.finishTransaction(
  importedToken,
  await TokenState.create(recipientPredicate, new TextEncoder().encode('my custom data')),
  importedTransaction,
);
```

### Offline Token Transfer

For scenarios with limited network connectivity, tokens can be transferred using offline transaction packages:

```typescript
// Assume that token has already been minted or received and is available
let token: Token;
let senderSecret: Uint8Array; // Sender's secret key

// This secret belongs to the receiver that the token is sent to 
const receiverSecret = crypto.getRandomValues(new Uint8Array(32));
const recipientTransactionData = new TextEncoder().encode('my custom data');

// Recipient prepares the info for the transfer using token ID and type from the sender.
const nonce = crypto.getRandomValues(new Uint8Array(32));
const receiverSigningService = await SigningService.createFromSecret(receiverSecret, nonce);
const recipientPredicate = await MaskedPredicate.create(
  token.id,
  token.type,
  receiverSigningService,
  HashAlgorithm.SHA256,
  nonce,
);

const recipient = await DirectAddress.create(recipientPredicate.reference);
const recipientDataHash = await new DataHasher(HashAlgorithm.SHA256).update(recipientTransactionData).digest();

// The sender creates the transfer transaction, using recipientPredicate.reference sent by the receiver
const salt = crypto.getRandomValues(new Uint8Array(32));
const senderSigningService = await SigningService.createFromSecret(senderSecret, token.state.unlockPredicate.nonce);

const transactionData = await TransactionData.create(
  token.state,
  recipient.toString(),
  salt,
  recipientDataHash,
  new TextEncoder().encode('my transaction message'),
  token.nametagTokens,
);

const commitment = await Commitment.create(transactionData, senderSigningService);

// Sender serializes commitment
const commitmentJson = CommitmentJsonSerializer.serialize(commitment);

// Sender serializes token
const tokenJson = token.toJSON();

const predicateFactory = new PredicateFactory();
const tokenFactory = new TokenFactory(new TokenJsonSerializer(predicateFactory));
const commitmentSerializer = await new CommitmentJsonSerializer(predicateFactory);

const importedToken = await tokenFactory.create(tokenJson);
const importedCommitment = commitmentSerializer.deserialize(
  importedToken.id,
  importedToken.type,
  parsedJson.commitment,
);

const response = await client.submitCommitment(importedCommitment);
if (response.status !== SubmitCommitmentStatus.SUCCESS) {
  throw new Error(`Failed to submit transaction commitment: ${response.status}`);
}

// Since submit takes time, inclusion proof might not be immediately available
const inclusionProof = await client.getInclusionProof(importedCommitment);
const transaction = await client.createTransaction(importedCommitment, inclusionProof);

// The recipient finishes the transaction with the recipient predicate
const updateToken = await client.finishTransaction(
  importedToken,
  await TokenState.create(recipientPredicate, recipientTransactionData),
  transaction,
);
```

### Checking Token Status

```typescript
// You need the public key of the current owner to check token status
const publicKey = signingService.getPublicKey();
const status = await client.getTokenStatus(token, publicKey);
/* 
  status InclusionProofVerificationStatus.OK is spent
  status InclusionProofVerificationStatus.PATH_NOT_INCLUDED is unspent
 */
```

### The Token Split Operation

```typescript
// Create aggregator client
const aggregatorClient = new AggregatorClient('https://gateway-test.unicity.network:443');
const client = new StateTransitionClient(aggregatorClient);


const textEncoder = new TextEncoder();
const coinId = new CoinId(textEncoder.encode('COIN'));

const secret = crypto.getRandomValues(new Uint8Array(128)); // User secret key
const tokenId = TokenId.create(crypto.getRandomValues(new Uint8Array(32))); // Chosen ID
const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(32))); // Token type
const tokenData = new Uint8Array(0); /* Your own token data object with ISerializable attributes */
const coinData = TokenCoinData.create([[coinId, 100n]]);
const salt = crypto.getRandomValues(new Uint8Array(32)); /* Your random salt bytes */
const stateData = new Uint8Array(0); /* Your state data bytes */

const nonce = crypto.getRandomValues(new Uint8Array(32)); /* Your random nonce bytes */
const signingService = await SigningService.createFromSecret(secret, nonce);
const predicate = await MaskedPredicate.create(tokenId, tokenType, signingService, HashAlgorithm.SHA256, nonce);
const recipient = await DirectAddress.create(predicate.reference);

const mintCommitment = await client.submitMintTransaction(
  await MintTransactionData.create(
    tokenId,
    tokenType,
    tokenData,
    coinData,
    recipient.toString(),
    salt,
    await new DataHasher(HashAlgorithm.SHA256).update(stateData).digest(),
    null,
  ),
);

// Since submit takes time, inclusion proof might not be immediately available
const mintInclusionProof = await client.getInclusionProof(mintCommitment);
const mintTransaction = await client.createTransaction(mintCommitment, mintInclusionProof);

const token = new Token(await TokenState.create(predicate, stateData), mintTransaction, []);

const builder = new TokenSplitBuilder();
const predicates = new Map<bigint, MaskedPredicate>();
const splits: [CoinId, bigint][] = [
  [coinId, 10n],
  [coinId, 20n],
  [coinId, 70n],
];
for (const [id, amount] of splits) {
  const tokenId = TokenId.create(crypto.getRandomValues(new Uint8Array(32)));
  const tokenType = TokenType.create(crypto.getRandomValues(new Uint8Array(32)));
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const signingService = await SigningService.createFromSecret(secret, nonce);
  const stateData = new Uint8Array(); // Your state data bytes

  const predicate = await MaskedPredicate.create(tokenId, tokenType, signingService, HashAlgorithm.SHA256, nonce);
  predicates.set(tokenId.toBitString().toBigInt(), predicate);

  const address = await DirectAddress.create(predicate.reference);
  const splitTokenBuilder = builder.createToken(
    tokenId,
    tokenType,
    new Uint8Array(),
    address.toString(),
    await TokenState.create(predicate, stateData),
    new DataHasherFactory(HashAlgorithm.SHA256, DataHasher),
    crypto.getRandomValues(new Uint8Array(32)),
  );

  splitTokenBuilder.addCoin(id, amount);
}

const splitResult = await builder.build(new DataHasherFactory(HashAlgorithm.SHA256, NodeDataHasher));

const burnPredicate = await BurnPredicate.create(
  token.id,
  token.type,
  crypto.getRandomValues(new Uint8Array(32)),
  splitResult.rootHash,
);

const burnData = textEncoder.encode('custom burn token data');

const burnCommitment = await Commitment.create(
  await TransactionData.create(
    token.state,
    (await DirectAddress.create(burnPredicate.reference)).toString(),
    crypto.getRandomValues(new Uint8Array(32)),
    await new DataHasher(HashAlgorithm.SHA256).update(burnData).digest(),
    textEncoder.encode('custom transaction message'),
  ),
  await SigningService.createFromSecret(secret, token.state.unlockPredicate.nonce),
);

const burnCommitmentResponse = await client.submitCommitment(burnCommitment);
if (burnCommitmentResponse.status !== SubmitCommitmentStatus.SUCCESS) {
  throw new Error(`Failed to submit burn commitment: ${burnCommitmentResponse.status}`);
}

// Since submit takes time, inclusion proof might not be immediately available
const burnInclusionProof = await client.getInclusionProof(burnCommitment);

const burnToken = await client.finishTransaction(
  token,
  await TokenState.create(burnPredicate, burnData),
  await client.createTransaction(burnCommitment, burnInclusionProof),
);

const splitTokenDataList = await splitResult.getSplitTokenDataList(burnToken);
const splitTokens = await Promise.all(
  splitTokenDataList.map(async (data) => {
    const commitment = await client.submitMintTransaction(data.transactionData);

    // Since submit takes time, inclusion proof might not be immediately available
    const inclusionProof = await client.getInclusionProof(commitment);
    const transaction = await client.createTransaction(commitment, inclusionProof);

    return new Token(data.state, transaction, []);
  }),
);
```

## Unicity Signature Standard

The Unicity Network uses a standardized signature format to ensure data integrity and cryptographic proof of ownership. All cryptographic operations use the **`secp256k1`** elliptic curve, **SHA-256** hashing, and **33-byte compressed public keys**.

The standard is designed for efficiency and broad compatibility across different programming environments, including Node.js, browsers, and Go.

### Signature Format

A Unicity signature is a **65-byte** array, structured as the concatenation of three components: `[R || S || V]`.

| Component    | Size (bytes) | Offset | Description                                                                                                   |
| :----------- | :------------- | :----- | :------------------------------------------------------------------------------------------------------------ |
| **R**        | 32             | 0      | The `R` value of the ECDSA signature.                                                                         |
| **S**        | 32             | 32     | The `S` value of the ECDSA signature.                                                                         |
| **V**        | 1              | 64     | The **recovery ID** (`0` or `1`). This value allows for the recovery of the public key directly from the signature. |

### Process Overview

**1. Signing**
The raw message data is first hashed using **SHA-256**. The resulting 32-byte hash is then signed using the signer's 32-byte `secp256k1` private key to produce the 65-byte signature.

**2. Verification**
The verifier hashes the original message using **SHA-256**. Using this hash and the signature, the verifier recovers the public key. The recovered key is then serialized into the compressed format and compared byte-for-byte against the expected **33-byte compressed public key** to confirm validity.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- **Repository**: [GitHub](https://github.com/unicitynetwork/state-transition-sdk)
- **Issues**: [GitHub Issues](https://github.com/unicitynetwork/state-transition-sdk/issues)
- **Gateway API**: `https://gateway-test.unicity.network`

---

**Note**: This SDK is part of the Unicity ecosystem. For production use, ensure you understand the security implications and test thoroughly in the testnet environment.
