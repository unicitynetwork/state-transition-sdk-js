Feature: Split edge cases — degenerate shapes and idempotency

  # PR #110 — pin the boundary behaviours of TokenSplit + the new SplitMintJustification flow.

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token with 2 payment assets

  # Degenerate: split into 1 output (single recipient consumes everything)
  Scenario: Split into a single output succeeds and produces 1 verified token
    When Alice splits the token into 1 output that consumes all assets
    Then the burn transaction succeeds
    And 1 split token is minted
    And each split token passes TokenSplit verification

  # Idempotency: same cert request submitted twice should be safe — the aggregator either
  # returns SUCCESS (idempotent dedup of identical bytes) or STATE_ID_EXISTS (state-collision
  # rejection). What MUST NOT happen is silent double-spend or some other status.
  Scenario: Re-submitting the same split-mint cert request is idempotent
    When Alice splits the token into 2 outputs and remembers the first cert request
    And the same cert request is submitted again
    Then the second submission status is one of "SUCCESS" or "STATE_ID_EXISTS"
