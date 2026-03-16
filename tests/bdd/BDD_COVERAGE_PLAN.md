# BDD Coverage Plan — Missing Scenarios by Test Technique

## Tier 1 — Must Have (Security & Correctness)

- [x] **T1-01** `certification-status-all-values` — SIGNATURE_VERIFICATION_FAILED *(State Transition + Branch Coverage)*
  - `token-certification-status.feature` → `certification-status.steps.ts`
  - Scenario: "Transfer signed with wrong key is rejected by aggregator"
- [ ] **T1-02** `inclusion-proof-all-statuses` — All InclusionProofVerificationStatus enum values *(Branch Coverage + Risk-Based)*
  - **Blocked**: requires mock aggregator infrastructure to craft specific proof failures
  - Statuses to cover: PATH_INVALID, MISSING_CERTIFICATION_DATA, NOT_AUTHENTICATED, LEAF_VALUE_MISMATCH, INVALID_TRUSTBASE
- [ ] **T1-03** `tampered-inclusion-proof` — Detect tampered proof data *(Error Guessing + Risk-Based)*
  - **Blocked**: requires constructing tokens with manipulated proof bytes; CBOR tampering unreliable
- [x] **T1-04** `corrupted-cbor-import` — Import malformed CBOR fails gracefully *(Error Guessing + Risk-Based)*
  - `token-cbor-integrity.feature` → `cbor-integrity.steps.ts`
  - Scenario: "Importing truncated CBOR data fails"
  - Scenario: "Importing random bytes as a token fails"
- [x] **T1-05** `wrong-key-transfer-rejected` — Transfer signed with wrong key rejected *(Error Guessing + Risk-Based)*
  - `token-certification-status.feature` → `certification-status.steps.ts`
  - Combined with T1-01: "Transfer signed with wrong key is rejected by aggregator"
- [x] **T1-06** `duplicate-token-id-mint` — Duplicate mint detected at finalization *(State Transition)*
  - `token-certification-status.feature` → `certification-status.steps.ts`
  - Scenario: "Duplicate mint is detected via inclusion proof mismatch"
  - v2 behavior (Option B): both submits return SUCCESS, second mint rejected at inclusion proof
- [x] **T1-07** `split-value-boundaries` — Overflow, underflow, and minimum asset splits *(BVA + Equivalence Partitioning)*
  - `token-split-boundaries.feature` → `split-boundaries.steps.ts`
  - Scenario: "Split where total exceeds original value fails" (60+50=110 > 100)
  - Scenario: "Split where total is less than original value fails" (30+30=60 < 100)
  - Scenario: "Split with minimum asset value of 1 is accepted" (1+99=100)

## Tier 2 — Should Have (Robustness)

- [x] **T2-01** `self-transfer` — Owner transfers token to themselves *(Decision Table)*
  - `token-transfer-edge-cases.feature` → `transfer-edge-cases.steps.ts`
  - Scenario: "Owner transfers token to themselves"
- [x] **T2-02** `wrong-trust-base` — Verify against different trust base fails *(Error Guessing + Risk-Based)*
  - `token-wrong-trust-base.feature` → `wrong-trust-base.steps.ts`
  - Scenario: "Token verified against wrong trust base fails"
  - Creates RootTrustBase with random validator key, asserts VerificationStatus.FAIL
- [x] **T2-03** `long-transfer-chain` — 10-hop chain verifies correctly *(BVA + Loop Testing)*
  - `token-long-transfer-chain.feature` → `long-transfer-chain.steps.ts`
  - Scenario: "Token survives 10-hop transfer chain"
  - Alternates transfers between Alice and Bob, timeout: TREE_BUILD_TIMEOUT (120s)
- [x] **T2-04** `multi-asset-split-combos` — Pairwise: {1,2,3} assets × {2,3} targets *(Pairwise/Combinatorial)*
  - `token-split-combinations.feature` → `split-combinations.steps.ts`
  - Scenario Outline with 4 examples: 1×2, 2×3, 3×2, 3×3
  - Assets: value = (index+1)*100; splits use floor division + remainder to first part
- [x] **T2-05** `stale-token-reuse` — Old Token object cannot be reused after further transfer *(Decision Table + State Transition)*
  - `token-transfer-edge-cases.feature` → `transfer-edge-cases.steps.ts`
  - Scenario: "Stale token object cannot be reused after transfer"
  - Uses stale `this.token` after successful transfer to Bob → STATE_ID_EXISTS

## Tier 3 — Nice to Have (Completeness)

- [x] **T3-01** `token-id-boundary-lengths` — 0, 31, 32, 33 byte TokenId *(BVA)*
  - `token-id-boundaries.feature` → `id-boundaries.steps.ts`
  - Scenario Outline: "Minting with N-byte token ID is accepted" (0, 31, 32, 33)
  - **Finding**: aggregator accepts all TokenId byte lengths — no length validation exists (potential bug)
- [x] **T3-02** `empty-extreme-tx-data` — Empty / large transaction data *(Equivalence Partitioning)*
  - `token-transaction-data.feature` → `transaction-data.steps.ts`
  - Scenario: "Minting with empty transaction data succeeds"
  - Scenario: "Minting with large transaction data succeeds" (10KB)
  - Scenario: "Transfer with large transaction data succeeds" (10KB)
- [x] **T3-03** `full-payment-use-case` — End-to-end mint→split→pay→verify journey *(Use Case Testing)*
  - `token-payment-journey.feature` → `payment-journey.steps.ts`
  - Scenario: "Complete payment flow from mint through split to transfer"
  - Mint with assets → split keeping ownership → transfer split token to Bob → verify
- [x] **T3-04** `cbor-roundtrip-all-states` — CBOR round-trip for minted, transferred, split child *(Checklist-Based)*
  - `token-cbor-roundtrip.feature` → `cbor-roundtrip.steps.ts`
  - Scenario: "Freshly minted token survives CBOR roundtrip"
  - Scenario: "Token after transfer survives CBOR roundtrip"
  - Scenario: "Split child token survives CBOR roundtrip"
- [x] **T3-05** `nested-verification-details` — Inspect nested VerificationResult structure *(Branch Coverage + Cause-Effect)*
  - `token-verification-details.feature` → `verification-details.steps.ts`
  - Scenario: "Minted token verification result contains genesis and transfer rules"
  - Scenario: "Transferred token verification result includes transfer sub-entries"

## Files Created

| File | Covers | Technique |
|------|--------|-----------|
| `features/token-certification-status.feature` | T1-01, T1-05 | Branch Coverage + Error Guessing |
| `steps/certification-status.steps.ts` | T1-01, T1-05 | (step definitions) |
| `features/token-cbor-integrity.feature` | T1-04 | Error Guessing + Risk-Based |
| `steps/cbor-integrity.steps.ts` | T1-04 | (step definitions) |
| `features/token-split-boundaries.feature` | T1-07 | BVA + Equivalence Partitioning |
| `steps/split-boundaries.steps.ts` | T1-07 | (step definitions) |
| `features/token-transfer-edge-cases.feature` | T2-01, T2-05 | Decision Table + State Transition |
| `steps/transfer-edge-cases.steps.ts` | T2-01, T2-05 | (step definitions) |
| `features/token-wrong-trust-base.feature` | T2-02 | Error Guessing + Risk-Based |
| `steps/wrong-trust-base.steps.ts` | T2-02 | (step definitions) |
| `features/token-long-transfer-chain.feature` | T2-03 | BVA + Loop Testing |
| `steps/long-transfer-chain.steps.ts` | T2-03 | (step definitions) |
| `features/token-split-combinations.feature` | T2-04 | Pairwise/Combinatorial |
| `steps/split-combinations.steps.ts` | T2-04 | (step definitions) |
| `support/World.ts` | T2-04, T3-01, T3-05 | Added `assetIds`, `mintError`, `verificationResult` properties |
| `features/token-id-boundaries.feature` | T3-01 | BVA |
| `steps/id-boundaries.steps.ts` | T3-01 | (step definitions) |
| `features/token-transaction-data.feature` | T3-02 | Equivalence Partitioning |
| `steps/transaction-data.steps.ts` | T3-02 | (step definitions) |
| `features/token-payment-journey.feature` | T3-03 | Use Case Testing |
| `steps/payment-journey.steps.ts` | T3-03 | (step definitions) |
| `features/token-cbor-roundtrip.feature` | T3-04 | Checklist-Based |
| `steps/cbor-roundtrip.steps.ts` | T3-04 | (step definitions) |
| `features/token-verification-details.feature` | T3-05 | Branch Coverage + Cause-Effect |
| `steps/verification-details.steps.ts` | T3-05 | (step definitions) |
