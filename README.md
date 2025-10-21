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

Note: for examples, see further down in the [Examples section](#examples) or browse around in the [tests folder](./tests) of this SDK.

## Core Components

### StateTransitionClient

The main SDK interface for token operations:

- `submitMintCommitment()` - Submit mint commitment to aggregator
- `submitTransferCommitment()` - Submit transaction commitment to aggregator
- `finalizeTransaction()` - Complete token transfers
- `getTokenStatus()` - Check token status via inclusion proofs
- `getInclusionProof()` - Retrieve inclusion proof for a commitment

### Address System

**DirectAddress**: Cryptographic addresses with checksums for immediate ownership
**ProxyAddress**: Addresses which uses nametags

To use address sent by someone:
```typescript
const address = await AddressFactory.createAddress('DIRECT://582200004d8489e2b1244335ad8784a23826228e653658a2ecdb0abc17baa143f4fe560d9c81365b');
```

To obtain an address for minting, or for sending the address to someone, the address is calculated from a predicate reference. Such addresses add privacy and unlinkability in the case of the masked predicate:
```typescript
const reference = await MaskedPredicateReference.create(
  tokenType,
  signingAlgorithm,
  publicKey,
  hashAlgorithm,
  nonce,
);

const address = await reference.toAddress();
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
const secret = crypto.getRandomValues(new Uint8Array(128)); // User secret key
const tokenId = new TokenId(crypto.getRandomValues(new Uint8Array(32))); // Chosen ID
const tokenType = new TokenType(crypto.getRandomValues(new Uint8Array(32))); // Token type
const tokenData = null; /* Your own token data object with ISerializable attributes */
const coinData = TokenCoinData.create([/* [CoinId, value] elements to have coins in token */]);
const salt = crypto.getRandomValues(new Uint8Array(32)); /* Your random salt bytes */

// Create aggregator client
const aggregatorClient = new AggregatorClient('https://gateway-test.unicity.network:443');
const client = new StateTransitionClient(aggregatorClient);

// Create root trust base from desired location, current example is for nodejs
const trustBaseJsonString = fs.readFileSync(path.join(__dirname, 'trust-base.json'), 'utf-8');
const trustBase = RootTrustBase.fromJSON(JSON.parse(trustBaseJsonString));

const nonce = crypto.getRandomValues(new Uint8Array(32));
const predicate = MaskedPredicate.create(
  tokenId,
  tokenType,
  await SigningService.createFromSecret(secret, nonce),
  HashAlgorithm.SHA256,
  nonce,
);

const predicateReference = await predicate.getReference();
const commitment = await MintCommitment.create(
  await MintTransactionData.create(
    tokenId,
    tokenType,
    tokenData,
    coinData,
    await predicateReference.toAddress(),
    salt,
    null,
    null,
  ),
);

const response = await client.submitMintCommitment(commitment);
if (response.status !== SubmitCommitmentStatus.SUCCESS) {
  throw new Error(`Failed to submit mint commitment: ${response.status}`);
}

return Token.mint(
  trustBase,
  new TokenState(predicate, null),
  commitment.toTransaction(await waitInclusionProof(trustBase, client, commitment)),
);
```

### Token Transfer

This example begins after the previous example. Here we assume that the tokens have already been minted and we wish to send the tokens to a new recipient.

Note that the examples here are using some utility functions and classes that are defined below in a separate section.

#### Sender side
```typescript
// Assume that token has already been minted or received
const token: Token;
const signingService: SigningService; // Sender's signing service, same as mint example predicate signing service

const recipient = ProxyAddress.fromNametag('RECIPIENT');
const receiverDataHash = null; // Hash of the data for the receiver, or null if no data

const commitment = await TransferCommitment.create(
  token,
  recipient,
  crypto.getRandomValues(new Uint8Array(32)),
  receiverDataHash,
  textEncoder.encode('my transaction message'),
  signingService,
);

const response = await client.submitTransferCommitment(commitment);
if (response.status !== SubmitCommitmentStatus.SUCCESS) {
  throw new Error(`Failed to submit transaction commitment: ${response.status}`);
}

const transaction = commitment.toTransaction(await waitInclusionProof(trustBase, client, commitment));

// Transfer transaction and token to recipient
JSON.stringify(transaction);
JSON.stringify(token);
```

#### Receiver side

1. Create nametag

```typescript
const secret = crypto.getRandomValues(new Uint8Array(128)); // User secret key
const tokenType = new TokenType(crypto.getRandomValues(new Uint8Array(32))); // Token type
const salt = crypto.getRandomValues(new Uint8Array(32)); /* Your random salt bytes */

const targetAddressReference = await UnmaskedPredicateReference.createFromSigningService(
  tokenType,
  SigningService.createFromSecret(secret, null),
  HashAlgorithm.SHA256,
);

const nonce = crypto.getRandomValues(new Uint8Array(32));
const predicateReference = await MaskedPredicateReference.createFromSigningService(
  tokenType,
  SigningService.createFromSecret(secret, null),
  HashAlgorithm.SHA256,
  nonce
);

const nametag = 'RECIPIENT';
    
const commitment = await MintCommitment.create(
  await MintTransactionData.createFromNametag(
    nametag,
    tokenType,
    await predicateReference.toAddress(),
    salt,
    await targetAddressReference.toAddress()
  ),
);

const response = await client.submitMintCommitment(commitment);
if (response.status !== SubmitCommitmentStatus.SUCCESS) {
  throw new Error(`Failed to submit mint commitment: ${response.status}`);
}

const predicate = await MaskedPredicate.create(
  commitment.transactionData.tokenId,
  commitment.transactionData.tokenType,
  await SigningService.createFromSecret(secret, nonce),
  HashAlgorithm.SHA256,
  nonce,
);

const nametagToken = Token.mint(
  trustBase,
  new TokenState(predicate, null),
  commitment.toTransaction(await waitInclusionProof(trustBase, client, commitment)),
);
```

2. Receive the token

```typescript
let secret; // Same secret as target address secret for nametag
const token = await Token.fromJSON(JSON.parse(tokenJson));
const transaction = await TransferTransaction.fromJSON(JSON.parse(transactionJson));

const transactionData = null; // Transaction data which hash was set by recipient

const predicate = await UnmaskedPredicate.create(
  token.id,
  token.type,
  SigningService.createFromSecret(secret, null),
  HashAlgorithm.SHA256,
  transaction.data.salt
);

// Finish the transaction with the Bob's predicate
const finalizedToken = await client.finalizeTransaction(
  trustBase,
  token,
  new TokenState(predicate, null),
  transaction,
);
```

### Checking Token Status

```typescript
// You need the public key of the current owner to check token status
const publicKey = signingService.getPublicKey();
const status = await client.getTokenStatus(trustBase, token, publicKey);
/* 
  status InclusionProofVerificationStatus.OK is spent
  status InclusionProofVerificationStatus.PATH_NOT_INCLUDED is unspent
 */
```

### The Token Split Operation

```typescript
// Assume that token has already been minted or received
const token: Token;
const signingService: SigningService; // Sender's signing service, same as mint example predicate signing service

const builder = new TokenSplitBuilder();

builder
  .createToken(
    new TokenId(crypto.getRandomValues(new Uint8Array(32))),
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    null,
    TokenCoinData.create([[new CoinId(textEncoder.encode('TEST1')), 10n]]),
    ProxyAddress.fromNameTag('RECIPIENT'),
    crypto.getRandomValues(new Uint8Array(32)),
    null,
  )
  .createToken(
    new TokenId(crypto.getRandomValues(new Uint8Array(32))),
    new TokenType(crypto.getRandomValues(new Uint8Array(32))),
    null,
    TokenCoinData.create([[new CoinId(textEncoder.encode('TEST2')), 20n]]),
    ProxyAddress.fromNameTag('RECIPIENT'),
    crypto.getRandomValues(new Uint8Array(32)),
    null,
  );

const split = await builder.build(token);
const burnCommitment = await split.createBurnCommitment(
  crypto.getRandomValues(new Uint8Array(32)),
  await SigningService.createFromSecret(ownerSecret, nonce),
);

const response = await client.submitTransferCommitment(burnCommitment);
if (response.status !== SubmitCommitmentStatus.SUCCESS) {
  throw new Error(`Submitting burn commitment failed: ${response.status}`);
}

const splitMintCommitments = await split.createSplitMintCommitments(
  trustBase,
  burnCommitment.toTransaction(await waitInclusionProof(trustBase, client, burnCommitment)),
);

// Proceed with usual minting flow for each split commitment
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
