# Token Split Offline Handoff Flow

## Background

Issue [#95](https://github.com/unicitynetwork/state-transition-sdk/issues/95) / PR [#100](https://github.com/unicitynetwork/state-transition-sdk/pull/100)

### Stated Goal (Issue #95)
Make mint transaction hashes stable/invariant regardless of when the burn inclusion proof arrives, by excluding Unicity inclusion proofs from `SplitMintReason` serialization.

### Actual Goal (from private discussion)
Increase speed of token splitting by allowing the sender to hand off split data to the receiver immediately, without waiting for inclusion proofs. The receiver then finalizes everything with their own internet connection.

### What Was Done (PR #100)
Instead of adding `toCBORWithoutProofs()`, the entire split API was restructured:
- `TokenSplitBuilder` changed from instance builder pattern to static `split()` method
- Returns a `TokenSplit` data object (serializable to JSON/CBOR) containing burn commitment, predicate, and merkle proofs
- User controls the full mint workflow instead of the SDK doing it internally

## Flow Diagrams

### Before (Old API) - Sender Controls Everything

```
SENDER                                SDK (TokenSplitBuilder)              AGGREGATOR
 |                                            |                                |
 |  1. new TokenSplitBuilder()                |                                |
 |  2. builder.createToken(                   |                                |
 |       id, type, data, coins,               |                                |
 |       recipient, salt, dataHash)           |                                |
 |     (repeat for each new token)            |                                |
 |                                            |                                |
 |  3. builder.build(token)                   |                                |
 |     <-- returns TokenSplit (opaque) -----> |                                |
 |                                            |                                |
 |  4. tokenSplit.createBurnCommitment(salt, signingService)                   |
 |     <-- returns commitment                 |                                |
 |                                            |                                |
 |  5. client.submit(commitment) -------------+------------------------------->|
 |                                            |                         wait...|
 |     <-- inclusionProof -------------------+------------------------------->|
 |                                            |                                |
 |  6. tokenSplit.createSplitMintCommitments(trustBase, burnTx)                |
 |     <-- returns ALL mint commitments       | (SDK builds everything:        |
 |         + minted tokens                    |  predicates, proofs, states)   |
 |                                            |                                |
 |  7. client.submit(each mint) -------------+------------------------------->|
 |     <-- wait for each inclusionProof -----+------------------------------->|
 |                                            |                                |
 |  SENDER DONE (after all proofs received)   |                                |
```

**Sender waited for:** burn proof + all mint proofs (~8-15 seconds)

### After (New API) - Sender Hands Off, Receiver Finalizes

```
SENDER (offline after step 2)         AGGREGATOR          RECEIVER
  |                                       |                  |
  | 1. TokenSplitBuilder.split(token,     |                  |
  |    coins, salt, signingService)       |                  |
  |    -- ALL OFFLINE, returns TokenSplit: |                  |
  |       .commitment (signed burn)       |                  |
  |       .predicate  (burn predicate)    |                  |
  |       .proofs     (merkle proofs)     |                  |
  |       .token      (original token)    |                  |
  |                                       |                  |
  | 2. submit burn commitment ----------->|                  |
  |    (single network call)              |                  |
  |                                       |                  |
  | 3. HAND OFF to receiver:              |                  |
  |    -- TokenSplit (JSON/CBOR)          |                  |
  |    -- New token metadata  -------------------------------->|
  |                                       |                  |
  | SENDER IS DONE                        |                  |
  | No waiting for inclusion proofs!      |                  |
  |                                       |  4. waitInclusionProof
  |                                       |<----(burn commit)|
  |                                       |--->| got burn proof
  |                                       |                  |
  |                                       |  5. token.update(trustBase,
  |                                       |     predicate, burnTx)
  |                                       |     -> burntToken (LOCAL)
  |                                       |                  |
  |                                       |  6. FOR EACH new token:
  |                                       |     build SplitMintReason(
  |                                       |       burntToken, proofs)
  |                                       |     build MintCommitment
  |                                       |     (ALL LOCAL)
  |                                       |                  |
  |                                       |  7. submit mint  |
  |                                       |<----commitments--|
  |                                       |                  |
  |                                       |  8. waitInclusionProof
  |                                       |<----(each mint)--|
  |                                       |--->|             |
  |                                       |                  |
  |                                       |  9. Token.mint() |
  |                                       |     (LOCAL)      |
  |                                       |     RECEIVER DONE|
```

**Sender waits for:** nothing (fire & forget, ~instant)

## User Impact Comparison

| Aspect | Before | After |
|---|---|---|
| Sender waits for | Burn proof + all mint proofs | Nothing (fire & forget) |
| Sender hands off | Finished tokens | Raw TokenSplit data |
| Receiver does | Nothing (gets ready tokens) | Waits for proofs, builds & submits mints |
| Speed for sender | ~8-15 seconds (all proofs) | ~instant (1 network call) |
| Who needs internet | Sender throughout | Sender briefly, then receiver |
| Previously created data | Not affected | Not affected (on-chain format unchanged) |

## Technical Details

### What Sender Gives Receiver (TokenSplit - serializable)
- `commitment` - the signed burn commitment (already submitted)
- `predicate` - the burn predicate for updating the token
- `proofs` - merkle proofs mapping each new tokenId to its coin distribution
- `token` - the original token being split

### Network vs Offline Operations

**Offline (no network required):**
- `TokenSplitBuilder.split()` - create burn commitment + proofs
- `MintCommitment.create()` - create mint commitments
- All serialize/deserialize (JSON/CBOR)
- `Token.mint()` - create token from transaction + proof
- `Token.update()` - update token with transaction + proof

**Requires network:**
- `submitTransferCommitment()` - submit burn commitment
- `submitMintCommitment()` - submit mint commitments
- `waitInclusionProof()` - poll aggregator for inclusion proofs

### Note on Mint Transaction Hash Stability
`MintTransactionData.calculateHash()` calls `toCBOR()` -> `reason.toCBOR()` -> `SplitMintReason.toCBOR()` -> `this.token.toCBOR()` (full burnt token with inclusion proofs). This means:
- Mint commitment hash still depends on the burnt token's inclusion proof
- Receiver must wait for burn inclusion proof before building mint commitments
- But the sender does not need to wait - the key improvement

## Test Plan: `testSplitOfflineHandoffFlow`

### Goal
Test the actual intended flow where sender prepares split data, hands it off (via JSON serialization), and receiver finalizes everything.

### Location
- Add `testSplitOfflineHandoffFlow` to `tests/token/CommonTestFlow.ts`
- Add test case in `tests/e2e/token/TokenUsageExampleTest.ts`

### Steps

**Step 1 - Setup:**
Mint a token for Alice with multi-coin data (same pattern as existing split tests).

**Step 2 - Sender (Alice) prepares split + submits burn:**
- Call `TokenSplitBuilder.split()` to get `TokenSplit`
- Submit burn commitment to aggregator (single call, no waiting for proof)
- Serialize `TokenSplit` to JSON: `JSON.stringify(tokenSplit.toJSON())`
- Alice is done - no `waitInclusionProof` on sender side

**Step 3 - Simulate offline handoff:**
- Parse JSON back: `await TokenSplit.fromJSON(JSON.parse(serialized))`
- This simulates a Nostr/offline/QR transfer of data from sender to receiver

**Step 4 - Receiver (Bob) finalizes with internet:**
- `waitInclusionProof(trustBase, client, importedTokenSplit.commitment)` - wait for burn proof
- `token.update(trustBase, predicate, burnTx)` - create burnt token locally
- For each entry in `tokenSplit.proofs.entries()`:
  - Create new token type, nonce, signing service, predicate
  - Build `SplitMintReason(burntToken, proof.proofs)`
  - Build `MintTransactionData` and `MintCommitment`
  - Submit mint commitment to aggregator
  - `waitInclusionProof` for each mint
  - `Token.mint()` to create final token

**Step 5 - Verify:**
- Each new token passes `verify(trustBase)`
- Coin distributions match expected values
- Original token is marked as spent

### Key Assertions
- `TokenSplit` survives full JSON round-trip (serialize -> deserialize)
- Sender never calls `waitInclusionProof`
- Receiver successfully finalizes using only handoff data + aggregator access
- All resulting tokens are valid and verifiable

### Suggested Timeout
25000ms (25 seconds) - similar to `testSplitFlowAfterTransfer`
