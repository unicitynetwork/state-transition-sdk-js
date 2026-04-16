# Nametag BDD scenarios — proposal

Target: exercise the option-1 nametag flow (plain mint-only `UnicityIdToken`, no special predicate) end-to-end through the BDD suite, and opportunistically amend a few existing features to route addressing through a nametag instead of a raw pubkey — so regressions in the lookup path are caught by existing coverage.

## Design principles

1. **Reuse, don't duplicate.** The BDD suite already has mint/transfer/split/verify scenarios for p2pk-addressed tokens. Nametag coverage should live in one new feature file plus surgical edits to a handful of existing ones — not a parallel copy of the whole suite.
2. **Option 1 only.** No `UnicityIdPredicate`, no embedded witness steps. Nametag is a lookup step that yields a `PayToPublicKeyPredicate`; everything downstream is identical to the existing flows.
3. **Deterministic nametags per scenario.** Tag strings are per-scenario (e.g. `@alice-<uuid>`) to avoid collisions when the feature runs against a live aggregator with state carried across runs.

## New support helpers

Add to `tests/bdd/functional/support/TestSetup.ts` (no feature file changes depend on signature — only step files call these):

```ts
export async function registerNametag(
  setup: ITestSetup,
  user: IUser,
  name: string,
  domain: string = 'bdd/test',
): Promise<UnicityIdToken>;

export async function resolveNametag(
  setup: ITestSetup,
  token: UnicityIdToken,
): Promise<Address>; // = Address.fromPredicate(token.genesis.targetPredicate)
```

`registerNametag` performs the full option-1 mint: builds `UnicityId`, creates `UnicityIdMintTransaction.create(...)`, submits via `CertificationData.fromTransaction(...)`, waits for inclusion proof, mints `UnicityIdToken`, verifies, returns.

`resolveNametag` is trivial but isolates the lookup step so BDD steps stay declarative — and leaves a natural place to add caching/off-chain-fetch logic later without touching every scenario.

## New feature: `tests/bdd/functional/features/token-nametag.feature`

```gherkin
Feature: Nametag-addressed tokens (Unicity ID, option 1)
  As an SDK consumer
  I want to address tokens to a human-readable @name
  So that senders can resolve recipients without exchanging raw pubkeys

  Background:
    Given Alice has a signing key
    And Bob has a signing key

  Scenario: Alice registers a nametag and verifies it
    When Alice registers the nametag "@alice" in domain "bdd/test"
    Then Alice's nametag token verifies successfully
    And Alice's nametag token resolves to Alice's predicate

  Scenario: Bob sends a token to Alice by nametag
    Given Alice has registered the nametag "@alice"
    When Bob mints a token addressed to "@alice"
    Then Alice can verify the received token
    And Alice can spend the token using her signing key

  Scenario Outline: Nametag resolution rejects tampered or stale tokens
    Given Alice has registered the nametag "@alice"
    When the nametag token is <tampering>
    Then verifying the nametag token fails with "<reason>"

    Examples:
      | tampering                               | reason                            |
      | truncated by one byte                   | Invalid token genesis             |
      | re-signed with a different aggregator   | Certification signature mismatch  |
      | serialised against a stale trust base   | Invalid token genesis             |

  Scenario: Two nametags cannot share the same name in the same domain
    Given Alice has registered the nametag "@alice"
    When Mallory attempts to register the nametag "@alice" in domain "bdd/test"
    Then nametag registration fails

  Scenario: A token addressed by nametag spends like a normal p2pk token
    Given Alice has registered the nametag "@alice"
    And Bob has minted a token addressed to "@alice"
    When Alice transfers the token to Carol's pubkey
    Then Carol can spend the token using her signing key
    And no nametag appears in Carol's token history
```

The last scenario is the important one for the scope decision — it asserts the **invariant** that nametag use is a sender-side lookup only. Aggregator and downstream holders never see the nametag. If a future option-2 implementation leaked the nametag into the token history, this scenario fails.

## Amendments to existing features

Target features where recipient-addressing is the operative step. Convert *one* scenario per feature into a `Scenario Outline` so the existing p2pk coverage stays intact and the nametag path gets exercised in the same code path:

### `token-minting.feature`

Current:
```gherkin
Scenario: Mint a token to a given owner
  When Alice mints a token addressed to Bob's pubkey
  Then Bob can spend the token
```

Proposed amendment (outline replaces the scenario):
```gherkin
Scenario Outline: Mint a token to a given owner, addressed by <addressing>
  Given Bob has registered the nametag "@bob" if <addressing> is "nametag"
  When Alice mints a token addressed to Bob via <addressing>
  Then Bob can spend the token

  Examples:
    | addressing |
    | pubkey     |
    | nametag    |
```

### `token-long-transfer-chain.feature`

Add the nametag variant only at **minting** (the chain's recipient chain stays pubkey-addressed). This costs one extra row but proves that nametag-minted tokens enter the normal transfer chain without divergence.

### `token-payment-journey.feature`

This is the user-flow story. Add a second example row that substitutes a nametag for the payee pubkey at the first hop. Later hops remain pubkey — matching real-world use where only the initial recipient is a known name.

### Do **not** touch

- `token-split*.feature`, `token-cbor-*.feature`, `token-certification-status.feature`, `token-security.feature`, `double-spend-prevention.feature`, `token-4level-*.feature`, `token-serialization*.feature`, `token-id-boundaries.feature`, `token-verification*.feature`, `wrong-trust-base.feature`, `shard-load-testing.feature`, `transfer-edge-cases.feature`, `transaction-data.feature`.

Rationale: nametag is an addressing-layer concern. Serialisation, split arithmetic, double-spend prevention, certification status, security, etc. are orthogonal and already covered by the pubkey flows. Adding nametag rows would inflate run-time without adding signal.

## New step definitions

One new file, `tests/bdd/functional/steps/nametag.steps.ts`, with:

```ts
Given('Alice has registered the nametag {string}', async function (name) { ... });
Given('Alice has registered the nametag {string} in domain {string}', ...);
When('Alice registers the nametag {string} in domain {string}', ...);
When('Bob mints a token addressed to {string}', async function (name) {
  // resolveNametag → Address.fromPredicate → MintTransaction.create
});
Then('Alice\'s nametag token verifies successfully', ...);
Then('Alice\'s nametag token resolves to Alice\'s predicate', ...);
Then('no nametag appears in {word}\'s token history', async function (holderName) {
  // assert none of token.transactions[*].sourceStateHash / lockScript encode a UnicityId
});
```

Plus a small amendment to `minting.steps.ts` to take an `addressing` parameter and dispatch between `user.predicate` and `nametagToken.genesis.targetPredicate`.

## Open questions for the maintainer

1. **Uniqueness enforcement.** The "Two nametags cannot share the same name" scenario assumes the aggregator rejects a duplicate mint request for a given `(name, domain)` tuple. Need to confirm whether the aggregator actually enforces this, or if uniqueness is purely a social/directory-layer contract. If the latter, rewrite the scenario to assert "the second mint succeeds but directory lookup returns the first owner" — or drop it.
2. **Tampering cases.** The three tamper examples in the scenario outline are placeholders. Confirm which cases the `UnicityIdToken.verify` rule actually catches vs. which rely on the aggregator's signature. The outline should only list cases the SDK can reproduce deterministically.
3. **`UnicityIdPredicate*` removal.** The BDD suite does not need to cover option-2 code. If the option-2 files are kept in `src/`, there should still be **zero** BDD scenarios that address a token to `UnicityIdPredicate(...)` — otherwise we'd be encoding the rejected design into the test suite.

## Negative / hygiene scenarios — revised

**Revision note (post-review):** the scenarios in this section were originally framed as "catch possible security bugs". After walking through the actual attack surface, none of them are live vulnerabilities — see `docs/test-findings.md § Severity reassessment`. A forged transfer cannot be cryptographically valid (attacker lacks Alice's signing key and cannot forge BFT-signed aggregator proofs), and `UnicityIdToken.verify(...)` catches every forgery path. As long as consumers follow the documented `fromCBOR → verify → read genesis.targetPredicate` flow, nothing here is exploitable.

What these scenarios actually assert is **API-hygiene contracts** — the class shape and public surface match the option-1, mint-only scope so that consumers are never tempted to write an unsafe read. Keep them around as acceptance criteria for the cleanup (Rule A file removal + Rule B lifecycle-plumbing removal); drop them as runtime test suites once the cleanup lands, since the conditions they test for become impossible by construction.

### Suite: `token-nametag-negative.feature`

```gherkin
Feature: Nametag SDK refuses paths that violate the option-1, mint-only scope

  Background:
    Given Alice has a signing key
    And Bob has a signing key
    And Mallory has a signing key
```

#### Rule A — no special nametag predicate

**Scenario A1 — a token addressed to a `UnicityIdPredicate(@alice)` must not be accepted**

```gherkin
  Scenario: Addressing a token directly to a UnicityIdPredicate is rejected
    Given Alice has registered the nametag "@alice"
    When Bob builds a MintTransaction addressed to UnicityIdPredicate("@alice")
    Then building the transaction fails with "Unsupported predicate type"
      # OR, if the SDK accepts the construction:
      # submitting the certification request fails
      # OR Token.mint(...) rejects with a verification error
```

**Expected outcome today (with current code):** this scenario **fails** — `Address.fromPredicate(UnicityIdPredicate.create(...))` succeeds, `DefaultBuiltInPredicateVerifier` has `UnicityIdPredicateVerifier` registered, the aggregator will likely certify it, and `Token.mint` will verify the embedded nametag and accept the token. A passing run of this scenario indicates option 2 has been properly gated.

**Why this catches the bug:** exercises the fact that `PredicateVerifierService.create(trustBase)` wires option-2 by default. If the registration is removed (or gated behind an opt-in factory), this scenario turns green.

---

**Scenario A2 — `BuiltInPredicateType` does not expose `UnicityId`**

```gherkin
  Scenario: Public predicate type enum exposes only scope-approved types
    When the SDK lists built-in predicate types
    Then the list contains "PayToPublicKey"
    And the list does not contain "UnicityId"
```

**Expected outcome today:** **fails** — `UnicityId` is a member of `BuiltInPredicateType` (`src/predicate/builtin/BuiltInPredicateType.ts`). A pass requires removing the enum entry.

**Why this matters:** it's an API-surface assertion. A consumer scanning the enum for "what can I address to?" currently sees `UnicityId` and concludes option 2 is supported. A green test is a stable contract.

---

#### Rule B — nametag is mint-only, confused-deputy protection

**Scenario B1 — forged transfer on a nametag token is rejected at import time**

```gherkin
  Scenario: Importing a nametag token with any transfer history fails
    Given Alice has registered the nametag "@alice"
    When Mallory forges a CBOR payload appending a transfer of "@alice" to Mallory
    And Bob imports the forged CBOR via UnicityIdToken.fromCBOR
    Then import fails with "Nametag tokens are mint-only"
```

**Expected outcome today:** **fails** — `UnicityIdToken.fromCBOR` (`src/unicity-id/UnicityIdToken.ts:34`) parses the transfer list without complaint; `verify()` then iterates it and will either accept (if the aggregator certified the forged transfer — out of SDK control) or reject for the wrong reason (a transfer-rule failure, not a shape-level refusal).

**Why this catches the bug:** asserts the strictest form of Rule B — the token type structurally cannot carry transfers. If the maintainer strips `_transactions`/transfer-plumbing per the recommendation, this scenario passes. If they leave the plumbing in, they at least need to add an early refusal in `fromCBOR` to make it pass.

---

**Scenario B2 — nametag resolution is genesis-only, never latest-transaction**

*(Softer variant of B1. Use this if the maintainer wants to keep transfer plumbing for future use but still guarantee the safe lookup.)*

```gherkin
  Scenario: Nametag resolution always returns the mint-time owner
    Given Alice has registered the nametag "@alice"
    When Mallory forges a CBOR payload appending a (self-consistent) transfer of "@alice" to Mallory
    And Bob imports the forged CBOR via UnicityIdToken.fromCBOR
    Then resolving "@alice" through the forged token returns Alice's predicate
    And Bob's token addressed to "@alice" can only be spent by Alice
    And spending with Mallory's key fails with "Predicate mismatch"
```

**Expected outcome today:** **partial / fragile**. `genesis.targetPredicate` still points to Alice, so *if* the consumer correctly uses `genesis.targetPredicate`, Alice wins. But nothing in the API shape forces that read. A future consumer writing `token.transactions.at(-1).recipient` would silently route to Mallory — and this scenario would not detect that misuse because it tests the safe code path.

**Why this catches the bug:** gives the SDK a reason to either (a) remove the `transactions` getter from `UnicityIdToken`, or (b) rename `genesis.targetPredicate` to something unambiguous like `ownerPredicate` and document it as the only correct read. The scenario's failure mode — "spending with Mallory's key succeeds" — is the concrete confused-deputy exploit.

---

**Scenario B3 — `UnicityIdToken.transactions` is not part of the public surface**

```gherkin
  Scenario: Nametag tokens do not expose a transactions accessor
    Given Alice has registered the nametag "@alice"
    When a consumer inspects the UnicityIdToken API
    Then there is no public "transactions" accessor
    And there is no public "transfer" method
```

**Expected outcome today:** **fails** — `transactions` getter is public (`src/unicity-id/UnicityIdToken.ts:26`). A pass requires either making it private or removing it entirely (recommended under Rule B).

**Why this matters:** this is a structural assertion that removes the temptation to write unsafe lookups. Not a runtime scenario — implemented as a TypeScript/JSDoc compile-time check — but expressed as BDD to keep the contract visible.

---

### Suite amendment: `token-nametag.feature` (already proposed above)

Add this as a final safety check to the happy-path feature:

```gherkin
  Scenario: Nametag does not appear in downstream token histories
    Given Alice has registered the nametag "@alice"
    And Bob has minted a token addressed to "@alice"
    When Alice transfers the token to Carol's pubkey
    And Carol transfers the token to Dave's pubkey
    Then none of Dave's token's transactions contain a UnicityId
    And none of Dave's token's predicates are UnicityIdPredicate
```

**Expected outcome today:** **passes** — because the E2E addresses via `Address.fromPredicate(aliceUnicityIdToken.genesis.targetPredicate)`, which is the `PayToPublicKeyPredicate`, not the nametag predicate. But nothing in the SDK enforces that addressing must go through the pubkey predicate — a consumer who addresses directly to `UnicityIdPredicate("@alice")` (see A1) would fail this scenario. Running A1 + this one together gives you the two ends of the invariant: *the nametag is a sender-side lookup, never leaks into token history*.

---

## Test-design-technique coverage matrix

Earlier sections of this document were pragmatic (happy path + 5 hygiene scenarios). This section revisits the same problem against a full technique taxonomy so we know which categories are covered and which are still blank.

### Addressing-method refactor (prerequisite for most additions)

Almost every technique below benefits from a single abstraction: **recipient addressing**. Extract one helper in `tests/bdd/functional/support/TestSetup.ts`:

```ts
type AddressingMethod = 'pubkey' | 'nametag';

export async function resolveRecipientAddress(
  setup: ITestSetup,
  user: IUser,
  method: AddressingMethod,
  nametag?: UnicityIdToken,
): Promise<Address>;
```

Steps that today say *"mints a token addressed to Bob"* become *"mints a token addressed to Bob via <method>"* and delegate to the helper. A `Scenario Outline` with an `| method |` column then runs every affected scenario once per addressing method, without duplicating the Gherkin. This is what the "Equivalence partitioning" and "Pairwise" rows below exploit.

### Existing features: refactor candidacy (outline over addressing)

| Feature file | Addressing is the operative concern? | Action |
|---|---|---|
| `token-minting.feature` | Yes | Outline all 3 scenarios over `{pubkey, nametag}`. |
| `token-transfer.feature` | Yes | Outline "Owner transfers" and "Transferred token passes verification" over `{pubkey, nametag}` at both ends. |
| `token-transfer-chain.feature` | At mint only | Outline only the mint step. Intermediate hops stay pubkey. |
| `token-long-transfer-chain.feature` | At mint only | Same. |
| `token-payment-journey.feature` | Mint + first hop | Outline first-hop recipient. Later hops pubkey. |
| `token-split-transfer.feature` | Recipient of each child | Outline recipient across split children. |
| `token-split-advanced.feature` | Recipient of each child | Same. |
| `token-4level-owner-actions.feature` | Recipient of the downward hop | Outline recipient method only on the "Owner can transfer to recipient" scenario. |
| `token-split*.feature` (others), `token-cbor-*.feature`, `token-serialization*.feature`, `token-security.feature`, `token-certification-status.feature`, `token-id-boundaries.feature`, `token-4level-verification.feature`, `token-4level-*-negative.feature`, `token-transaction-data.feature`, `token-transfer-edge-cases.feature`, `token-wrong-trust-base.feature`, `token-verification-details.feature`, `token-split-boundaries.feature`, `token-split-combinations.feature`, `double-spend-prevention.feature`, `shard-load-testing.feature` | No | Leave alone — orthogonal to addressing. Adding a nametag column would inflate run time with no new signal. |

Estimated new work from amendments only: **8 scenario outlines × 2 rows = 16 additional scenario runs** across the existing suite (cheap, one new step + the helper).

### New scenarios, grouped by test-design technique

Each subsection gives the technique name, what it's for in this domain, and the concrete scenarios that implement it.

#### 1. Equivalence partitioning — valid / invalid nametag inputs

*One representative from each class.*

```gherkin
Feature: Nametag input classes

  Scenario Outline: Nametag registration accepts <class> input "<name>"/"<domain>"
    When Alice attempts to register a nametag with name "<name>" and domain "<domain>"
    Then the outcome is "<outcome>"

    Examples:
      | class                       | name         | domain        | outcome            |
      | typical ASCII               | alice        | bdd/test      | success            |
      | name with digits            | alice42      | bdd/test      | success            |
      | no domain                   | alice        |               | success            |
      | empty name                  |              | bdd/test      | reject: empty name |
      | whitespace-only name        |              | bdd/test      | reject: empty name |
      | name with "@"               | @alice       | bdd/test      | reject: reserved   |
      | name with "/"               | al/ice       | bdd/test      | reject: reserved   |
      | unicode name                | αλίκη        | bdd/test      | success            |
      | trailing whitespace         | alice        | bdd/test      | normalised-or-rejected |
```

The last row is a **design question** — the SDK currently does no normalisation. The scenario is written as "normalised-or-rejected" deliberately to force a decision, not to pass silently either way.

#### 2. Boundary value analysis — name/domain lengths

```gherkin
  Scenario Outline: Name length boundary "<bytes>" bytes
    When Alice registers a nametag of length <bytes>
    Then the outcome is "<outcome>"

    Examples:
      | bytes | outcome                 |
      | 0     | reject                  |
      | 1     | success                 |
      | 255   | success                 |
      | 256   | ? (needs documented cap) |
      | 65535 | ? (CBOR text-string cap) |
```

Open question for the maintainer: what is the documented max? If none, scenarios at 256 and 65535 flush it out.

#### 3. Decision table — (name, domain, already-registered) combinations

```gherkin
  Scenario Outline: Registration decision table
    Given the nametag "<name>" in domain "<domain>" is <prior-state>
    When Alice attempts to register "<name>" in "<domain>"
    Then the outcome is "<outcome>"

    Examples:
      | name  | domain    | prior-state                     | outcome                                  |
      | alice | bdd/test  | unregistered                    | success                                  |
      | alice | bdd/test  | registered by Alice             | aggregator returns existing proof        |
      | alice | bdd/test  | registered by Mallory           | reject: state collision                  |
      | alice |           | unregistered                    | success                                  |
      | alice | bdd/test  | registered in different domain  | success (domains partition namespace)    |
```

This converts what was previously the single "uniqueness" scenario into a proper matrix. You correctly pointed out uniqueness is enforced at the aggregator by `tokenId` derivation — these rows document exactly what that means per combination.

#### 4. State transition — mint-only lifecycle, no TRANSFERRED

```gherkin
  Scenario: Only the MINT → MINTED transition is reachable
    Given Alice has registered the nametag "@alice"
    When Alice attempts to call UnicityIdToken.transfer(...)
    Then the call fails with "not supported"

  Scenario: A nametag token has no CBOR-level transfer list
    Given Alice has registered the nametag "@alice"
    When aliceToken.toCBOR() is inspected
    Then the transfers array is empty
```

Two states (`UNMINTED`, `MINTED`), one transition, no exits. This is the state-transition technique encoded as a contract.

#### 5. Use case — register → lookup → send → spend → forward

Already covered by `token-nametag.feature` (happy path feature). The "downstream invisible" scenario is the use-case endpoint assertion.

#### 6. Error guessing — exploratory catches

Based on "what would a tester probably miss":

```gherkin
  Scenario: Case sensitivity of nametag names
    Given Alice has registered the nametag "@alice"
    When Bob looks up "@Alice"
    Then the outcome is either "not found" or "resolved to Alice"  # must be documented

  Scenario: Unicode normalisation
    Given Alice has registered "@café" (NFC form)
    When Bob looks up "@cafe\u0301" (NFD form)
    Then the outcome is either "same owner" or "not found"  # must be documented

  Scenario: Leading/trailing whitespace in lookup
    Given Alice has registered "@alice"
    When Bob looks up "  @alice  "
    Then lookup rejects or trims — documented either way
```

These are design-forcing scenarios: the test suite refuses silent behaviour.

#### 7. Pairwise / combinatorial

```gherkin
  Scenario Outline: Addressing × token-type × assets
    When Bob mints a token of type <type> with <assets> assets, addressed to Alice via <method>
    Then the token verifies
    And Alice can spend it with her signing key

    Examples:
      | method  | type       | assets |
      | pubkey  | plain      | 0      |
      | pubkey  | fungible   | 3      |
      | nametag | plain      | 3      |
      | nametag | fungible   | 0      |
```

Four rows cover all pairs of (method, type) and (method, assets). Full factorial would be 8 rows — pairwise halves it.

#### 8. Risk-based prioritisation

Mark scenarios with risk tags so CI can run the high-risk subset on every PR and the full suite nightly. Risk order for nametags:

| Risk | Tag | Scenarios |
|---|---|---|
| High — addressing/payment mis-routing | `@nametag-critical` | A1, B1, B2, happy-path send-by-nametag, downstream-invisible |
| Medium — spec consistency | `@nametag-standard` | A2, B3, decision-table rows, equivalence valid rows |
| Low — input ergonomics | `@nametag-edge` | unicode, whitespace, case |

#### 9. Cause-effect / error-classification

```gherkin
  Scenario Outline: Invalid nametag input produces correctly-classified error
    When Alice attempts to register a nametag with <input>
    Then the error class is <class>
    And the error message contains <phrase>

    Examples:
      | input                      | class              | phrase             |
      | empty name                 | ValidationError    | "empty"            |
      | reserved character in name | ValidationError    | "reserved"         |
      | domain too long            | ValidationError    | "length"           |
```

Asserts callers can distinguish retriable-vs-not, not just "some error was thrown".

#### 10. Static / review (not a runtime scenario — executed in CI as type or grep check)

```gherkin
  # Implemented as a unit-test or CI script, surfaced as a @static BDD scenario.
  Scenario: Option-2 surface is absent
    When the SDK's public exports are enumerated
    Then there is no export named UnicityIdPredicate
    And there is no export named UnicityIdPredicateUnlockScript
    And there is no export named UnicityIdPredicateVerifier
    And BuiltInPredicateType does not contain "UnicityId"
```

Red today; green after the option-2 cleanup.

### Mixed addressing — extensive coverage

Real Sphere traffic will mix addressing methods: first hop by `@nametag`, subsequent hops by pubkey (or the reverse — directory wallet receives by pubkey, forwards by nametag). Single-method scenarios do not catch the bugs that appear only at the *boundary* between methods. This section treats mixed addressing as a first-class surface.

#### Why mixed coverage is distinct from single-method coverage

Bugs uniquely visible under mixing:

1. **Address-encoding asymmetry.** If a nametag-derived `Address` differs byte-for-byte from a pubkey-derived one pointing at the same predicate (extra tag, different hash prefix, normalization drift), the second hop fails with `"Predicate does not match address"` from `TransferTransaction.create` (`src/transaction/TransferTransaction.ts:46`). Single-method chains never hit this.
2. **History-leak regression.** The "`@alice` must not appear in downstream CBOR" invariant only makes sense after a nametag-entry followed by a pubkey-continuation. Single-method pubkey chains have nothing to leak; single-method nametag chains don't reach the downstream holder (and shouldn't, per option 1).
3. **Verifier-stack cross-contamination.** `PredicateVerifierService` dispatches per predicate engine. Mixed chains invoke `PayToPublicKeyPredicateVerifier` and (if option 2 stays) `UnicityIdPredicateVerifier` in the same run. Any shared mutable state in the service, or incorrect caching keyed by predicate engine rather than instance, surfaces only here.
4. **Certification-data unlock-script symmetry.** `CertificationData.fromTransaction` is called with the predecessor's unlock script. If the predecessor was a nametag recipient (option 1: still a `PayToPublicKeyPredicateUnlockScript`, because the embedded target is pubkey) but the verifier path-checks the lock script differently depending on how the recipient was resolved, the transition fails.
5. **Split-reason predicate chain.** A split produces a burn + N children. If the parent was nametag-addressed and the children are pubkey-addressed, `SplitReason` must still verify — and vice versa. This is a combinatorial surface not exercised by the current `token-split-*` features.

#### New feature: `token-mixed-addressing.feature`

```gherkin
Feature: Mixed addressing — nametag and pubkey in the same token lifetime
  Regression surface for Sphere-style flows where entry and continuation
  use different addressing methods.

  Background:
    Given the SDK is configured against the live aggregator
    And Alice, Bob, Carol, Dave have fresh signing keys
    And Alice has registered the nametag "@alice"
    And Carol has registered the nametag "@carol"

  # --- 2-hop mixing ---

  Scenario: Nametag entry, pubkey exit
    When Bob mints a token addressed to "@alice"
    And Alice transfers the token to Bob's pubkey
    Then both transactions verify
    And Bob can spend the token with his signing key
    And the final token's CBOR does not contain the bytes of "@alice"

  Scenario: Pubkey entry, nametag exit
    When Alice mints a token addressed to Bob's pubkey
    And Bob transfers the token to "@carol"
    Then both transactions verify
    And Carol can spend the token with her signing key
    And the final token's predicate chain contains only PayToPublicKey predicates

  # --- 4-hop mixing, exhaustive sequence outline ---

  Scenario Outline: 4-hop chain with addressing sequence <seq>
    When a 4-hop transfer chain runs using addressing sequence <seq>
    Then every hop's certification succeeds
    And every hop's verification status is OK
    And the final holder can spend the token with their signing key
    And no nametag string survives into the final token's CBOR

    Examples:
      | seq                                 |
      | pubkey, pubkey, pubkey, pubkey      |   # baseline (existing coverage)
      | nametag, pubkey, pubkey, pubkey     |   # Sphere-style entry
      | pubkey, nametag, pubkey, pubkey     |   # nametag mid-chain
      | pubkey, pubkey, nametag, pubkey     |   # nametag late-chain
      | pubkey, pubkey, pubkey, nametag     |   # nametag terminal
      | nametag, nametag, pubkey, pubkey    |   # consecutive nametag prefix
      | nametag, pubkey, nametag, pubkey    |   # alternating
      | pubkey, nametag, nametag, pubkey    |   # consecutive mid
      | nametag, nametag, nametag, nametag  |   # all nametag (stress)
      | nametag, pubkey, pubkey, nametag    |   # bookended

  # --- mixed addressing through a split ---

  Scenario Outline: Split with mixed-method recipients, parent via <parent-method>
    Given Alice holds a splittable token addressed via <parent-method>
    When Alice splits the token into three children addressed to:
      | recipient | method  |
      | Bob       | pubkey  |
      | "@carol"  | nametag |
      | Dave      | pubkey  |
    Then the burn transaction verifies
    And every child token verifies independently
    And each child's CBOR is routable only to its intended recipient

    Examples:
      | parent-method |
      | pubkey        |
      | nametag       |

  Scenario: Deep mixed chain survives CBOR round-trip at every hop
    When a 4-hop chain runs with sequence [nametag, pubkey, nametag, pubkey]
    And at every hop the receiver re-imports the token via Token.fromCBOR
    Then every re-imported token verifies
    And every re-imported token is spendable by its owner

  # --- negative / adversarial mixing ---

  Scenario: Spending fails when recipient-method predicate does not match unlock
    Given Alice has registered "@alice"
    When Bob mints a token addressed to "@alice"
    And Alice attempts to spend the token presenting Mallory's signing key
    Then spending fails with "Unlock script verification failed"
    # Ensures nametag-resolved addresses are not treated as "open" anywhere

  Scenario: Impersonation attempt via re-registering the same nametag
    Given Alice has registered "@alice"
    When Mallory attempts to register "@alice" in the same domain
    Then Mallory's registration is rejected by the aggregator's stateId uniqueness
    And Bob's subsequent send to "@alice" still routes to Alice's predicate

  Scenario: Stale nametag token cannot poison an ongoing chain
    Given Alice has registered "@alice" at time T0
    And Bob has minted a token addressed to "@alice" using that nametag
    When the test produces a stale CBOR of Alice's nametag at time T0 - 1 (missing future transfers, if any)
    Then Bob's sent token still verifies against the current trust base
    And Alice can still spend it with her signing key
    # Guards the invariant that nametag resolution is a *sender-side* concern
    # and the token's ownership proof lives in genesis, not in a fresh lookup.

  # --- mixed addressing and history invariants ---

  Scenario: Nametag string never appears in downstream history
    When a 4-hop chain runs with sequence [nametag, pubkey, pubkey, pubkey]
    Then for every token in the chain after hop 1,
         the CBOR bytes do not contain the UTF-8 encoding of "@alice"
    And for every predicate in every token's transaction list,
         the predicate type is PayToPublicKey

  Scenario: Pubkey predicate preserved through a nametag hop
    When Alice (entered via "@alice") transfers to Bob's pubkey,
         and Bob transfers to Carol via "@carol"
    Then the transaction into "@carol" resolves to Carol's PayToPublicKey predicate
    And the verification chain contains three PayToPublicKey verifications
    And zero UnicityIdPredicate verifications
    # If the last assertion fails, option 2 is silently in play (Rule A regression).
```

#### Support infrastructure for mixed scenarios

One new helper in `tests/bdd/functional/support/TestSetup.ts`:

```ts
export interface Hop {
  from: IUser;
  to: IUser;
  method: AddressingMethod;
}

export async function runMixedChain(
  setup: ITestSetup,
  hops: Hop[],
  nametagRegistry: Map<IUser, UnicityIdToken>,
): Promise<{ tokensAtEachHop: Token[]; finalToken: Token }>;
```

The `nametagRegistry` parameter makes the `"all participants have signing keys and registered nametags"` step trivial to express — register once, reuse across the outline rows.

#### Counts for mixed addressing

| Sub-category | Scenario rows |
|---|---:|
| 2-hop mixing (nametag↔pubkey, both directions) | 2 |
| 4-hop chain outline | 10 sequences |
| Split with mixed recipients | 2 parent methods × 1 split shape = 2 |
| CBOR round-trip under mixing | 1 |
| Negative / adversarial | 3 |
| History invariants | 2 |
| **Total** | **20** |

Added to the earlier incremental count (~60) gives **~80 scenario-rows** net new for full technique + mixed-addressing coverage.

### Missing / blank coverage (gaps)

Things no current or proposed scenario exercises:

1. **Off-chain directory lookup.** The scope comment describes fetching the nametag token "based on nostr". The BDD suite assumes the test already has `aliceUnicityIdToken` in memory. A gap: the *resolution* step (how does Bob get the token?). Proposal: mock a `NametagDirectory` interface in `TestSetup.ts` and have steps resolve through it. Even a simple in-memory map is enough to make the scenario read like real Sphere flow.
2. **Trust-base-aware revocation semantics.** If the aggregator rotates its trust base, what happens to an old nametag token? Currently `verify()` fails with "stale trust base"; no scenario covers the reverify-after-rotation use case.
3. **Size / cost scenarios.** A nametag token is added to the genesis in option 1 — the CBOR bytes are Bob's problem to fetch, not the aggregator's. A scenario measuring `.toCBOR().length` at the boundaries (0, 1, 255, 65535) would catch any accidental bloat (e.g. if someone adds metadata to `UnicityIdMintTransaction`).
4. **Concurrency.** Two Bobs try to send to `@alice` simultaneously. Today: both succeed independently — nametag is read-only. If option 2 ever ships, this becomes a race condition. Scenario to add only if option 2 lands.
5. **Rate-limit / DoS.** Not SDK's concern, flag for aggregator-level BDD.

### Scenario count after full refactor

| Category | Count |
|---|---:|
| Existing feature amendments (outlines) | 8 features × 2 addressing rows each on average = 16 scenario-rows |
| Nametag happy path (existing proposal) | 6 |
| Rule A / Rule B hygiene (existing proposal) | 5 |
| Equivalence partitioning | 1 outline × 9 rows |
| BVA | 1 outline × 5 rows |
| Decision table | 1 outline × 5 rows |
| State transition | 2 scenarios |
| Error guessing | 3 scenarios |
| Pairwise | 1 outline × 4 rows |
| Cause-effect | 1 outline × 3 rows |
| Static | 1 scenario |
| **Total incremental** | **~60 scenario-rows** |

## Implementation order for the maintainer

1. Run `npm install` so `@cucumber/cucumber` resolves.
2. Apply the `const` fix already landed in `tests/functional/FunctionalTransitionFlowTest.ts` + delete or rewrite category-B legacy files (see `test-findings.md`).
3. Decide scope (option 1 + mint-only, or keep option 2 for later). The scenarios above then become the acceptance criteria for that decision.
4. Implement the happy-path nametag feature (`token-nametag.feature`) and helpers.
5. Add the negative scenarios above and use their red-to-green transition to drive the cleanup in `src/`.

## Effort estimate

- 1 new feature file (~40 lines of Gherkin)
- 1 new step file (~120 lines)
- 2 helper functions in `TestSetup.ts` (~40 lines)
- 3 amended feature files (one outline conversion each)
- 1 amended step file (`minting.steps.ts`, ~15 lines)

Roughly a half-day. No new dev deps.
