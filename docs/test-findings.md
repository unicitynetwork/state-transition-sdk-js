# Test Findings — issue-98 merge into feature/test-infrastructure

Captures SDK surface changes encountered while porting the BDD/e2e test suite from the pre-2.0 API to the current tree (`issue-98` on top of SDK 2.0, commit `3e3a7fe`).

## Scope of issue-98 vs. out-of-scope changes

Per the agreed scope ("plain name tag tokens: mint + validation only — no name-tag predicate, no lifecycle, no aggregator-side witness validation"), only a small subset of the merged diff is actually about nametags. The rest rode along because `issue-98` is built on top of SDK 2.0 and on top of other fixes (#92, #96).

| Area | Nametag-related? | Notes |
|---|---|---|
| `src/unicity-id/UnicityId.ts` (name string + domain) | **Yes** | Core nametag identity. |
| `src/unicity-id/UnicityIdToken.ts` (mint + verify) | **Yes** | Option-1 behavior: plain token, mint + validate only. |
| `src/unicity-id/UnicityIdMintTransaction.ts` | **Yes** | Mint-only lifecycle. |
| `src/unicity-id/CertifiedUnicityIdMintTransaction.ts` | **Yes** | Certified form used during verify. |
| `src/predicate/builtin/UnicityIdPredicate.ts` + verifier + unlock script | **Partially / likely dead** | Explored "option 2" (nametag as special predicate). Coverage is 0% in E2E. Kept in tree but not exercised per the scope decision — candidate for removal. |
| `src/transaction/verification/rule/CertifiedUnicityIdMintTransactionVerificationRule.ts` | **Yes** | Mint-path verification rule. |
| `tests/utils/TransitionFlow.ts` (new `transitionFlowTest`) | **Yes** | Mints a `UnicityIdToken`, then mints/transfers a regular token addressed to its predicate. |
| `PayToScriptHash` → `Address` rename | **No** (SDK 2.0) | Comes from commit `3e3a7fe` "Draft version of sdk 2.0". |
| `PredicateVerifier` → `PredicateVerifierService` (now requires `trustBase`) | **No** (SDK 2.0) | Verifier service is trust-base-aware. |
| `PayToPublicKeyPredicate.create(signingService)` → `.fromSigningService(...)` + `.create(publicKey)` | **No** (SDK 2.0) | Constructor split into two factories. |
| `PayToPublicKeyPredicate.generateUnlockScript(tx, signer)` → `PayToPublicKeyPredicateUnlockScript.create(tx, signer)` | **No** (SDK 2.0) | Unlock script moved to its own class. |
| `CertificationData.fromTransferTransaction(...)` → `.fromTransaction(...)` | **No** (SDK 2.0) | Unified factory; `fromMintTransaction` kept for the auto-signed mint path. |
| `IPaymentData.toCBOR()` → `.encode()` | **No** (SDK 2.0) | Interface rename; `.decode` replaces `.fromCBOR` on custom payment data types. |
| `waitInclusionProof(trustBase, verifier, client, tx)` → `waitInclusionProof(client, trustBase, verifier, tx)` | **No** (SDK 2.0) | Argument order change. |
| `new TokenId(crypto.getRandomValues(...))` → `TokenId.generate()` / likewise `TokenType.generate()` | **No** (SDK 2.0) | Convenience factories. |
| Receipt removed from `CertificationRequest`/`Response` and from `submitCertificationRequest` signature | **No** (#92) | Landed before issue-98. `AggregatorClient.submitCertificationRequest(data)` now takes one argument. |
| `src/address/*` (AddressFactory, DirectAddress, ProxyAddress, AddressScheme, IAddress) removed | **No** (SDK 2.0) | Collapsed into `src/transaction/Address.ts`. |
| CBOR module moved to `src/serialization/cbor/*` (from older `commons/lib/cbor/*`) | **No** (SDK 2.0) | Affects legacy test files in `tests/token/`. |
| SMT restructure (`src/smt/plain/*`, `src/smt/sum/*`) | **No** (SDK 2.0) | Not touched by BDD. |
| `tests/e2e/token/TokenUsageExampleTest.ts` & `tests/token/CommonTestFlow.ts` deleted | **No** | Deleted by SDK 2.0 draft; the stashed local edits against them were issue-#95 split-flow work — not nametag. Dropped in this merge. |

Summary: the name-tag-related surface is narrow — the `src/unicity-id/*` files, the new verification rule, and the `TransitionFlow` E2E. The bulk of the churn in the branch is the SDK 2.0 rewrite and #92 receipt removal. The BDD rewrite we just did is entirely SDK-2.0-rename work — nothing in it is nametag-specific.

## API migration table (pre-2.0 → current)

Applied across `tests/bdd/**`:

| Old API | New API |
|---|---|
| `import { PayToScriptHash } from 'src/transaction/PayToScriptHash.js'` | `import { Address } from 'src/transaction/Address.js'` |
| `await PayToScriptHash.create(predicate)` | `await Address.fromPredicate(predicate)` |
| `PredicateVerifier.create()` | `PredicateVerifierService.create(trustBase)` |
| `PayToPublicKeyPredicate.create(signingService)` | `PayToPublicKeyPredicate.fromSigningService(signingService)` |
| `PayToPublicKeyPredicate.generateUnlockScript(tx, signer)` | `PayToPublicKeyPredicateUnlockScript.create(tx, signer)` |
| `CertificationData.fromTransferTransaction(tx, unlock)` | `CertificationData.fromTransaction(tx, unlock)` |
| `waitInclusionProof(trustBase, verifier, client, tx)` | `waitInclusionProof(client, trustBase, verifier, tx)` |
| `{ assets, toCBOR: () => Promise<Uint8Array> }` (inline `IPaymentData`) | `{ assets, encode: () => Promise<Uint8Array> }` |
| `new TokenId(crypto.getRandomValues(new Uint8Array(32)))` | `TokenId.generate()` (still supports `new TokenId(bytes)` for fixed bytes) |
| `aggregatorClient.submitCertificationRequest(data, receipt)` | `aggregatorClient.submitCertificationRequest(data)` |

## Effect on BDD user flow

BDD feature files (`tests/bdd/functional/features/*.feature`) are **not** affected — no Given/When/Then step text changed. The migration is purely behind the glue (`steps/*.ts`, `support/TestSetup.ts`, `support/ShardLoadRunner.ts`). All scenarios that previously passed should still describe the same user journey:

- `minting.feature`, `transfer.feature`, `transfer-chain.feature`, `transfer-edge-cases.feature`, `double-spend.feature`, `security.feature`, `certification-status.feature`, `split.feature`, `split-advanced.feature`, `split-transfer.feature`, `split-boundaries.feature`, `split-combinations.feature`, `tree-*.feature`, `serialization*.feature`, `cbor-*.feature`, `id-boundaries.feature`, `verification-details.feature`, `wrong-trust-base.feature`, `shard-load.feature`, `transaction-data.feature`

Runtime behaviour is expected to match pre-2.0 semantics because the SDK 2.0 changes are renames/re-factors, not protocol changes. The only observable API difference users of the SDK see in flow is the `CertificationData` factory split (separate factory for mints, unified factory for everything else with an explicit unlock script).

## Effect on developer flow (SDK consumers)

Developers integrating the SDK after 2.0 must:

1. Build recipient addresses via `Address.fromPredicate(predicate)` instead of `PayToScriptHash.create(...)`.
2. Construct the verifier with `PredicateVerifierService.create(trustBase)` — the trust base is now a mandatory dependency, so code must load the trust base before creating the verifier.
3. Build unlock scripts via `PayToPublicKeyPredicateUnlockScript.create(tx, signer)`; the old convenience helper on the predicate class is gone.
4. Build `CertificationData` for transfers via `CertificationData.fromTransaction(tx, unlockScript)`. Mints keep their own factory (`fromMintTransaction`) because the mint signer is derived deterministically from the `tokenId`.
5. Implement `IPaymentData` with `encode(): Promise<Uint8Array>` and a static `decode(bytes)` — not `toCBOR` / `fromCBOR`.
6. Call `waitInclusionProof` with `(client, trustBase, verifier, tx)`.
7. Call `AggregatorClient.submitCertificationRequest(data)` — the `receipt` argument was removed (#92).
8. For name-tag tokens: use `UnicityIdMintTransaction.create(...)` + `CertificationData.fromTransaction(...)` + `UnicityIdToken.mint(trustBase, verifier, certifiedTx)`; then address regular tokens to `aliceUnicityIdToken.genesis.targetPredicate` via `Address.fromPredicate(...)`. No special nametag predicate is required (option 1 scope).

## Option 1 vs option 2 — what's actually in the branch

From the #98 discussion: the question was *how should a regular token be addressed to a user known by a human-readable `@name` rather than a pubkey?*

**Option 1 — nametag is an ordinary, mint-only token.**
- Alice mints a `UnicityIdToken` binding `@alice` → her pubkey predicate. Published once; lives forever.
- To send Alice a token, Bob fetches her nametag token, verifies it, reads the pubkey predicate out of it, and addresses his token to **that pubkey predicate** — exactly as if he knew the pubkey directly.
- Alice spends with a normal `PayToPublicKeyPredicate` unlock. Aggregator never sees the nametag.

**Option 2 — nametag-as-predicate.**
- Tokens are addressed to `UnicityIdPredicate(@alice)` directly.
- Unlock script must embed the **entire nametag token** inside the witness.
- Aggregator validates the embedded nametag every tx; the full nametag lives inside every downstream tx history. Hostile to privacy, big witnesses, aggregator-side nametag validation.

Scope decision in the issue comments was explicit: *"just plain name tag tokens with mint tx only. Minting and validation. No lifecycle etc mentioned in the paper, and no special 'name tag predicate'."* → option 1 only.

### Files currently in the branch and which option they belong to

| File | Option | In scope? |
|---|---|---|
| `src/unicity-id/UnicityId.ts` | 1 | Yes |
| `src/unicity-id/UnicityIdMintTransaction.ts` | 1 | Yes |
| `src/unicity-id/CertifiedUnicityIdMintTransaction.ts` | 1 | Yes |
| `src/unicity-id/UnicityIdToken.ts` | 1 | Yes |
| `src/transaction/verification/rule/CertifiedUnicityIdMintTransactionVerificationRule.ts` | 1 | Yes |
| `src/predicate/builtin/UnicityIdPredicate.ts` | **2** | **No** |
| `src/predicate/builtin/UnicityIdPredicateUnlockScript.ts` | **2** | **No** |
| `src/predicate/builtin/verification/UnicityIdPredicateVerifier.ts` | **2** | **No** |
| `tests/utils/TransitionFlow.ts` (E2E) | 1 | Yes |

The E2E exercises only option 1. The `UnicityIdPredicate*` trio show 0% coverage because nothing in the repo uses them — they are the concrete skeleton of the option-2 design that was discussed and rejected.

### Proposed removal

- `src/predicate/builtin/UnicityIdPredicate.ts`
- `src/predicate/builtin/UnicityIdPredicateUnlockScript.ts`
- `src/predicate/builtin/verification/UnicityIdPredicateVerifier.ts`
- Corresponding `BuiltInPredicateType.UnicityId` entry and any wiring in `DefaultBuiltInPredicateVerifier`.

**Why remove:** scope decision ruled option-2 out; no callers; no tests; keeping them in `src/predicate/builtin/` is misleading — a developer will think option-2 is a supported integration path. Dead code that looks supported is worse than missing code.

**Why you might keep them:** the issue comment leaves the door open to implementing option-2 later. If that's near-term, leaving the skeleton saves re-deriving it — but it should then live under `src/predicate/experimental/` or similar with a README that says "not wired up".

Recommendation: **remove now**, restore from git history when/if option-2 is prioritized.

### BDD-author perspective

Nothing in `.feature` files changes either way. No nametag scenarios exist in BDD today; the only coverage lives in `tests/utils/TransitionFlow.ts` / `tests/e2e/E2ETransitionFlowTest.ts`. If you want nametag scenarios in BDD, the option-1 Gherkin is:

```
Given Alice has registered the nametag "@alice"
When Bob transfers a token addressed to "@alice"
Then Alice can spend the token using her normal signing key
```

No option-2 steps needed, no embedded-witness handling.

### SDK-consumer perspective

For nametag support on the current branch you only need:

```ts
import { UnicityId } from '.../unicity-id/UnicityId.js';
import { UnicityIdMintTransaction } from '.../unicity-id/UnicityIdMintTransaction.js';
import { UnicityIdToken } from '.../unicity-id/UnicityIdToken.js';
```

End-to-end flow (Alice registers `@alice`, Bob sends her a token):

1. **Alice registers:** build `new UnicityId('alice', 'unicity-labs/test')`, pick her target `PayToPublicKeyPredicate`, `UnicityIdMintTransaction.create(...)`, certify via aggregator, `UnicityIdToken.mint(...)` → publishes `aliceUnicityIdToken`.
2. **Bob sends:** fetch `aliceUnicityIdToken`, call `aliceUnicityIdToken.verify(trustBase, verifier)`, read `aliceUnicityIdToken.genesis.targetPredicate`, `Address.fromPredicate(that)`, and address his `MintTransaction` / `TransferTransaction` to that address.
3. **Alice spends:** uses a plain `PayToPublicKeyPredicateUnlockScript` — identical to any other p2pk token.

No `UnicityIdPredicate`, no `UnicityIdPredicateUnlockScript`, no `UnicityIdPredicateVerifier`. If those files were removed tomorrow the flow above would be unaffected.

## `build:check` errors — categorised

A clean `npm run build:check` currently reports 146 errors across 34 files. Breakdown:

| Category | Files | Errors | Root cause | Action |
|---|---|---:|---|---|
| **A. Missing `@cucumber/cucumber` dev dep** | all 29 BDD step/support files | 29 | `node_modules/` not populated on this machine (`@cucumber/cucumber@^12.6.0` is declared in `devDependencies`) | Run `npm install`. Not a code bug. |
| **B. Legacy pre-2.0 test files** | `tests/token/CommonTestFlow2.ts` (46), `tests/token/TokenUsageExample2Test.ts` (57), `tests/integration/token/TokenUsageExampleTest2.ts` (2), `tests/e2e/token/TestPrepareApiKeyPaymentTest.ts` (10) | 115 | Reference removed pre-SDK-2.0 APIs: `@unicitylabs/commons/lib/*`, `@unicitylabs/prefix-hash-tree`, `src/address/DirectAddress`, `src/token/*`, `MaskedPredicate`, `TokenCoinData`, `CoinId`, `submitMintTransaction`, `createTransaction`, `finishTransaction`, `submitCommitment`, `getTokenStatus`, `submitBurnTransactionForSplit`. | Delete or rewrite against 2.0 API. Not nametag scope. |
| **C. Trivial bug in `tests/functional/FunctionalTransitionFlowTest.ts`** | 1 | 2 | Missing `const` keyword on line 19 (`trustBase = RootTrustBase.fromJSON(...)`). | **Fixed** in this pass. |

After running `npm install` and removing/rewriting category B, `build:check` should be clean.

## Inconsistencies found in the issue-98 implementation

The scope comment from #98 has two independent rules:

> "just plain 'name tag tokens' with mint tx only. Minting and validation. **No lifecycle** etc mentioned in the paper, and **no special 'name tag predicate'**."

The inconsistencies split across those two rules:

### Rule A — "no special name tag predicate" (rules out option 2)

1. **Option-2 predicate verifier is registered by default.** `PredicateVerifierService.create(trustBase)` (`src/predicate/verification/PredicateVerifierService.ts:15`) wires `DefaultBuiltInPredicateVerifier.create(...)`, which in turn registers both `PayToPublicKeyPredicateVerifier` and **`UnicityIdPredicateVerifier`** (`src/predicate/builtin/DefaultBuiltInPredicateVerifier.ts:33-38`). So every SDK consumer who uses the default factory silently activates the option-2 path even though the scope decision is option-1 only. The code is not dead — it is reachable — it is simply unexercised.

2. **`BuiltInPredicateType.UnicityId` in the public type enum** (`src/predicate/builtin/BuiltInPredicateType.ts`) advertises option-2 as a first-class predicate type.

3. **`UnicityIdPredicate` / `UnicityIdPredicateUnlockScript` / `UnicityIdPredicateVerifier`** — the trio implements option 2: the verifier recursively embeds a full `UnicityIdToken` inside the unlock witness (`UnicityIdPredicateVerifier.verify` → `decodedUnlockScript.token.verify(trustBase, verifier)` — `src/predicate/builtin/verification/UnicityIdPredicateVerifier.ts:36-44`). Implementation is correct; the design is the one that was explicitly rejected.

### Rule B — "mint tx only, no lifecycle" (independent of option 1 vs 2)

4. **`UnicityIdToken` is half-transfer-capable.** `src/unicity-id/UnicityIdToken.ts` stores `_transactions: CertifiedTransferTransaction[]`, serialises them in `toCBOR()`, parses them in `fromCBOR()`, iterates them in `verify()`, and imports `CertifiedTransferTransactionVerificationRule` — i.e. everything you need to support a transfer lifecycle. But `transfer(...)` is commented out with `// TODO: Make it updatable`.

   This rule would be violated even if option 2 had been accepted — it's about whether `@alice` can be reassigned to a different owner over time, not about how other tokens are addressed.

### Severity reassessment (post-review)

After a second pass walking through what an attacker can actually do: **none of the Rule A / Rule B findings are live security vulnerabilities.** They are all API-hygiene or doc-note items. The reasoning:

- A forged transfer cannot be cryptographically valid — a nametag mint is addressed to Alice's `PayToPublicKeyPredicate`, so any subsequent transfer must be signed by Alice's private key. Mallory can't produce that signature, and even if she could, the transfer needs a BFT-signed aggregator inclusion proof she can't forge.
- `UnicityIdToken.verify(trustBase, predicateVerifier)` is the documented contract, and it catches every forgery path.
- Therefore: as long as a consumer follows the documented flow (`fromCBOR` → `verify` → read `genesis.targetPredicate`), none of A1/A2/B1/B2/B3 can be exploited.

Revised classification of each finding:

| Finding | Severity | Why |
|---|---|---|
| **A1** — addressing via `UnicityIdPredicate` embeds `@alice` in history | **Design choice, not a bug.** If option 2 is exposed, users who choose it accept its consequences. Handled entirely by Rule A cleanup (remove the three files). | Not a vulnerability; no SDK validation needed. |
| **A2** — `BuiltInPredicateType.UnicityId` advertised in enum | **Cleanup, resolved by construction** once the three option-2 files are deleted and the one registration line in `DefaultBuiltInPredicateVerifier.create` is removed. | API-contract hygiene. |
| **B1** — `UnicityIdToken.fromCBOR` accepts non-empty transfer lists | **Robustness / DX only.** Forged transfers fail `verify()` anyway, possibly with a cryptic signature error instead of a clean "nametags are mint-only" error. | Not a vulnerability. Optional early-refusal in `fromCBOR` for a better error. |
| **B2** — confused-deputy via `transactions.at(-1).recipient` | **Footgun, not a vulnerability.** Exploits a consumer who (a) imports an untrusted CBOR, (b) skips `verify()`, and (c) reads ownership from the latest transaction. Three consecutive deviations from the documented flow. | Remove the `transactions` getter to make (c) impossible by construction. |
| **B3** — public `transactions` getter / commented-out `transfer()` | **API hygiene.** Class shape suggests a lifecycle the scope decision forbids. | Remove getter + transfer plumbing along with Rule A cleanup. |

Bottom line: the only **mandatory** action is Rule A cleanup (delete the three option-2 files, one registration line, one enum entry). Rule B items are recommended tidying but carry no security risk as long as the documented verify-first contract is followed.

### Details — what "no live exploit" actually means (kept for reference)

**BDD perspective.** Every BDD scenario that uses a nametag ends with "Alice spends the token" or "Bob reads the recipient predicate out of `@alice`". The safe implementation of that read is `aliceUnicityIdToken.genesis.targetPredicate` — what the existing `tests/utils/TransitionFlow.ts:64` does. So *the happy path is fine today*.

The concern is a **confused-deputy risk**:

- `UnicityIdToken.fromCBOR` accepts and parses an arbitrary transactions array. No in-process method can produce one (because `transfer()` is commented out), but anyone with a CBOR encoder can craft such a blob.
- `verify()` iterates the transfer list and calls `CertifiedTransferTransactionVerificationRule.verify` on each entry.
- If a rogue party produces a CBOR blob that claims `@alice` was transferred to Mallory's predicate, and:
  - The certified-transfer rule accepts it (this is the aggregator's job to prevent at mint-time; if it does accept forged transfers, that's a separate aggregator bug), **and**
  - A consumer reads "current owner" from `token.transactions.at(-1).recipient` rather than from `token.genesis.targetPredicate` —

  then Mallory receives tokens meant for Alice. The shape of `UnicityIdToken` (public `transactions` getter, verify-over-transfers logic) actively invites a consumer to write the unsafe lookup.

**Classification:**

- Not a *confirmed* bug: no in-repo caller makes the unsafe read, and there is no BDD scenario that hits the path today.
- **Possible bug / latent vulnerability:** the API surface suggests a lifecycle that isn't implemented, and the safe-vs-unsafe lookup distinction is undocumented. First SDK consumer to write `token.transactions.at(-1).recipient` or to trust-but-not-verify a `fromCBOR`-imported nametag opens the attack. That is the definition of "API misuse-inviting design".
- **Also an API-contract inconsistency:** public surface declares a capability that the implementation refuses. A reader of the `.d.ts` file cannot tell from types alone that transfers are not supported — they have to read the commented-out code.

**BDD scenarios that would catch it** (proposed; none exist today):

```gherkin
Scenario: Nametag resolution ignores forged transfer history
  Given Alice has registered the nametag "@alice"
  When Mallory forges a CBOR nametag token appending a transfer to Mallory
  And Bob imports the forged nametag token via fromCBOR
  Then Bob's resolution of "@alice" still returns Alice's predicate
  And Bob's token sent to "@alice" can only be spent by Alice

Scenario: UnicityIdToken rejects any non-empty transaction list
  When Mallory creates a CBOR nametag token with a transfer appended
  Then importing the token via fromCBOR fails
  # Only meaningful if the scope decision removes transfer plumbing entirely.
```

The first scenario asserts the **safe-lookup invariant**. The second asserts a stricter contract (reject non-empty transfer list at parse time) that would remove the attack surface entirely — only adopt it if the decision is "strip transfer plumbing from `UnicityIdToken`".

### Decision point for the maintainer

- **If scope stays option-1 + mint-only:** remove the `UnicityIdPredicate*` trio, unregister it from `DefaultBuiltInPredicateVerifier`, drop the enum entry, **and** strip transfer plumbing from `UnicityIdToken` (reject non-empty transfer list in `fromCBOR`, remove `_transactions` field + transfer loop in `verify()`, remove `CertifiedTransferTransactionVerificationRule` import).
- **If option 2 is kept for later but still out of scope now:** move `UnicityIdPredicate*` to `src/predicate/experimental/`, do not register it in `DefaultBuiltInPredicateVerifier`, document as opt-in; still strip the lifecycle plumbing from `UnicityIdToken` — that's a separate rule.
- **If lifecycle is actually in scope** (contra the comment): uncomment `transfer()`, cover it with tests, and document how ownership resolution distinguishes "current owner" from "mint-time target".

## Nametag BDD scenarios — proposal

A separate proposal document is at `docs/nametag-bdd-proposal.md` covering: new feature file, step reuse, scenario outlines, and amendments to existing features that can opportunistically route through nametags instead of raw pubkey addresses.
