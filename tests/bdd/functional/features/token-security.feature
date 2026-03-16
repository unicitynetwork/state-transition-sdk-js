Feature: Token Security
  As a token owner
  I want my tokens to be secure from unauthorized transfers
  So that only I can transfer tokens I own

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  Scenario: Non-owner cannot create a transfer
    Given Bob is a registered user
    When Bob tries to create a transfer of Alice's token
    Then the transfer creation fails with a predicate mismatch error

  Scenario: Previous owner cannot reclaim transferred token
    Given Bob is a registered user
    And Alice has transferred the token to Bob
    When Alice tries to create a transfer of the token
    Then the transfer creation fails with a predicate mismatch error
