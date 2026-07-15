# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Type Checking
- Build: `npm run build`
- Type check (no emit): `npm run build:check`

### Linting
- Lint all code: `npm run lint`
- Lint with auto-fix: `npm run lint:fix`

### Testing
- Run all tests (excludes e2e): `npm run test`
- Run unit tests only: `npm run test:unit`
- Run integration tests only (requires Docker): `npm run test:integration`
- Run e2e tests only: `AGGREGATOR_URL='https://gateway-test.unicity.network' npm run test:e2e`
- Run a single test: `npm run test:single tests/path/to/test.ts -t "test description"`
- CI tests: `npm run test:ci`

Note: Integration tests require Docker to be installed and running.

## Architecture Overview

This SDK implements an off-chain token transaction system with on-chain security guarantees for the Unicity Protocol.

### Core Design Principles
- **Off-chain privacy**: Only cryptographic commitments (hashes) are published on-chain
- **Self-contained tokens**: Each token contains its complete transaction history and cryptographic proofs
- **State transitions**: Verified through consultation with blockchain infrastructure to prove single-spend
- **Modular architecture**: Pluggable predicates, address schemes, and token types

### Key Components

**StateTransitionClient** (`src/StateTransitionClient.ts`)
- Main SDK interface for token operations
- Methods: `submitMintCommitment()`, `submitTransferCommitment()`, `finalizeTransaction()`, `getInclusionProof()`, `isTokenStateSpent()`, `isMinted()`

**Token** (`src/token/Token.ts`)
- In-memory representation of a token with its complete transaction history
- Contains: `id`, `type`, `state`, `genesis` (mint transaction), `transactions` (transfer history), `nametagTokens`
- Methods: `mint()`, `update()`, `verify()`, `fromJSON()`, `fromCBOR()`

**Predicate System** (`src/predicate/`)
- Defines unlock conditions for tokens
- **UnmaskedPredicate**: Direct public key ownership (no privacy)
- **MaskedPredicate**: Privacy-preserving ownership (hides public keys via hashing)
- **BurnPredicate**: One-way predicate for token destruction (used in splits)
- All predicates implement `IPredicate` interface

**Address System** (`src/address/`)
- **DirectAddress**: Cryptographic addresses derived from predicate references
- **ProxyAddress**: Addresses using nametags for human-readable addressing
- **AddressFactory**: Creates addresses from serialized strings

**Transaction Types** (`src/transaction/`)
- **MintTransaction**: Creates new tokens
- **TransferTransaction**: Transfers token ownership
- **Commitment**: Pre-transaction commitment submitted to aggregator
- **InclusionProof**: Cryptographic proof that commitment was included on-chain

**Token Split** (`src/transaction/split/TokenSplitBuilder.ts`)
- Splits a token into multiple new tokens with different coin allocations
- Uses Sparse Merkle Sum Trees to prove coin distribution
- Process: burn original token → mint new tokens with split proof

### Directory Structure
- `src/token/` - Token data structures and state management
- `src/transaction/` - Transaction types and commitments
- `src/predicate/` - Predicate system (unlock conditions)
- `src/address/` - Address system (direct and proxy)
- `src/api/` - Aggregator client and JSON-RPC transport
- `src/bft/` - BFT consensus verification and trust base
- `src/hash/` - Data hashing utilities
- `src/sign/` - Signing service and signature handling
- `src/serializer/cbor/` - CBOR serialization/deserialization
- `src/mtree/` - Sparse Merkle Tree implementations
- `src/verification/` - Verification rules and results
- `src/util/` - Utility functions

### Transaction Flow

**Minting:**
1. Generate predicate for ownership
2. Create `MintCommitment` with token data
3. Submit commitment to aggregator via `submitMintCommitment()`
4. Retrieve inclusion proof
5. Create final token with `Token.mint()`

**Transfers:**
1. Recipient generates address from predicate reference
2. Sender creates `TransferCommitment` with recipient address
3. Submit commitment via `submitTransferCommitment()`
4. Retrieve inclusion proof
5. Create transaction with proof
6. Send transaction + token to recipient
7. Recipient finalizes with `finalizeTransaction()`

**Token Splits:**
1. Build split specification using `TokenSplitBuilder`
2. Create burn commitment for original token
3. Submit burn commitment
4. Create split mint commitments with proofs
5. Submit mint commitments for new tokens

## Code Style Guidelines

### TypeScript Conventions
- Use TypeScript strict mode with explicit types
- Interfaces must be prefixed with "I" and use PascalCase (e.g., `ISerializable`)
- Static readonly variables must use UPPER_CASE
- Always provide explicit function return types
- Explicit member accessibility required (public/private/protected)

### Code Organization
- Import order: builtin → external → internal with alphabetical sorting
- Use `.js` extension in imports (ES modules requirement)
- Sort object keys alphabetically where there are 2+ keys

### Best Practices
- Async/await is preferred over raw promises
- Error handling: Use specific error messages and proper error types
- Thorough input validation in constructors and factory methods
- Tests use Jest with descriptive test cases and appropriate timeouts

### Linting Rules (enforced by ESLint)
- `@typescript-eslint/explicit-function-return-type`: error
- `@typescript-eslint/explicit-member-accessibility`: error
- `@typescript-eslint/naming-convention`: enforces interface "I" prefix and static readonly UPPER_CASE
- `import/extensions`: require `.js` extensions
- `import/order`: enforce alphabetical import ordering with newlines between groups
- `sort-keys`: enforce alphabetical key sorting for objects with 2+ keys

## Testing Strategy

- **Unit tests** (`tests/unit/`): Test individual components in isolation
- **Functional tests** (`tests/functional/`): Test token usage flows with mock aggregator
- **Integration tests** (`tests/integration/`): Test with real aggregator in Docker container
- **E2E tests** (`tests/e2e/`): Test against live testnet aggregator

Test utilities available in `tests/`:
- `MintTokenUtils.ts` - Helper functions for minting tokens in tests
- `TestTokenData.ts` - Test token data structures
- `token/CommonTestFlow.ts` - Common test flows for token operations