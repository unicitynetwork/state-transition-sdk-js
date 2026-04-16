Feature: Nametag scope — hygiene scenarios (pending src cleanup)
  These scenarios encode the option-1, mint-only scope as executable contracts.
  They are expected to fail against the current src/ tree and turn green after
  the developer removes the option-2 files at release time. See
  docs/test-findings.md § "Severity reassessment".

  # --- Rule A: no special nametag predicate ---

  @pending-src-cleanup @nametag-critical
  Scenario: A1 — no token may be addressed to UnicityIdPredicate(@alice)
    # Pending until src/predicate/builtin/UnicityIdPredicate.ts is removed.
    # When the option-2 trio is deleted and DefaultBuiltInPredicateVerifier no
    # longer registers UnicityIdPredicateVerifier, constructing such an address
    # or certifying such a mint must fail. Step implementation is deferred until
    # that cleanup so this scenario remains undefined (hence skipped) today.

  @pending-src-cleanup @nametag-standard
  Scenario: A2 — BuiltInPredicateType enum contains only PayToPublicKey
    # Pending until BuiltInPredicateType.UnicityId is removed from the enum.

  # --- Rule B: mint-only, confused-deputy protection ---

  @pending-src-cleanup @nametag-critical
  Scenario: B1 — UnicityIdToken.fromCBOR rejects non-empty transfer list
    # Pending until UnicityIdToken.fromCBOR enforces an empty transfers array
    # structurally, before attempting to decode individual entries.

  @pending-src-cleanup @nametag-critical
  Scenario: B2 — latest-transaction read on a nametag token is impossible
    # Pending until UnicityIdToken removes its public `transactions` getter.

  @pending-src-cleanup @nametag-standard
  Scenario: B3 — UnicityIdToken's public shape matches mint-only scope
    # Pending: no public `transactions` accessor, no `transfer` method.
