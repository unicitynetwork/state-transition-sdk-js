Feature: Token Security
  As a token owner
  I want my tokens to be secure from unauthorized transfers
  So that only I can transfer tokens I own

  # Two attack vectors against the same negative-path assertion. They were considered for
  # promotion to a Scenario Outline but the preambles differ enough that two scenarios are
  # clearer than a 2-row outline padded with no-op meta-steps.

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token
    And Bob is a registered user

  Scenario: Non-owner cannot create a transfer of someone else's token
    When Bob tries to create a transfer of Alice's token
    Then the transfer creation fails with a predicate mismatch error

  Scenario: Previous owner cannot reclaim a transferred token
    Given Alice has transferred the token to Bob
    When Alice tries to create a transfer of the token
    Then the transfer creation fails with a predicate mismatch error
