# State Transition SDK

## Overview

The State Transition SDK is a TypeScript library that provides an off-chain token transaction framework. Tokens are managed, stored, and transferred off-chain with only cryptographic commitments published on-chain, ensuring privacy while preventing double-spending through single-spend proofs.
This is a low-level SDK, that supports transferring tokens, making payments, and splitting tokens. 
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

- `submitCertificationRequest()` - Submit transaction to aggregator
- `getInclusionProof()` - Retrieve inclusion proof for a commitment

### Transaction Flow

1. **Minting**: Create new tokens
2. **Transfer**: Submit state transitions between owners

#### Transfer flow

Prerequisites
Recipient knows some info about token, like token type for generating address.

```text
A[Start] 
A --> B[Recipient Generates Predicate]
B --> C[Recipient Shares Predicate with Sender]
C --> D[Sender Creates Transaction]
D --> E[Sender Submits Transaction]
E --> F[Sender Retrieves Inclusion Proof]
F --> G[Sender Creates Certified Transaction]
G --> H[Sender Updates Token with Certified Transaction]
H --> I[Sender Sends Token to Recipient]
I --> J[End]
```

## Architecture

### Token Structure

```
Token {
  genesis: CertifiedMintTransaction {
    transaction: MintTransaction {
      recipient: IPredicate,
      tokenId: TokenId,
      tokenType: TokenType,
      justification: Uint8Array | null
      data: Uint8Array | null
    },
    inclusionProof: InclusionProof
  },
  transactions: [
    CertifiedTransferTransaction {
      transaction: TransferTransaction {
        version: number,
        recipient: IPredicate,
        stateMask: Uint8Array,
        data: Uint8Array | null
      },
      inclusionProof: InclusionProof
    },
    ...
  ]
}
```

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
`tests/examples/mint/ExampleTest.ts`

### Token Transfer
`tests/examples/transfer/ExampleTest.ts`

### Token Splitting
`tests/examples/split/ExampleTest.ts`

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

- **Repository**: [GitHub](https://github.com/unicitynetwork/state-transition-sdk-js)
- **Issues**: [GitHub Issues](https://github.com/unicitynetwork/state-transition-sdk-js/issues)
- **Gateway API**: `https://gateway-test.unicity.network`

---

**Note**: This SDK is part of the Unicity ecosystem. For production use, ensure you understand the security implications and test thoroughly in the testnet environment.
