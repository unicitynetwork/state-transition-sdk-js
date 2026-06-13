Feature: Token Transfer Edge Cases
  As a user of the state transition SDK
  I want edge case transfers to be handled correctly
  So that the system behaves predictably

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  # T2-01: self-transfer (Decision Table)
  Scenario: Owner transfers token to themselves
    When Alice transfers the token to herself
    Then the transferred token passes verification

  # T2-05: stale-token-reuse (State Transition — the spent state cannot be re-spent).
  # Rejected at submit (STATE_ID_EXISTS) or at proof time (TRANSACTION_HASH_MISMATCH) per the
  # aggregator's submit path (aggregator-go#151 skip-finalized-dup-lookup). See sdk-js#118.
  Scenario: Stale token object cannot be reused after transfer
    Given Bob is a registered user
    When Alice transfers the token to Bob
    And Alice tries to submit a transfer of the stale token to Bob
    Then the stale-token re-spend is rejected as a double-spend
