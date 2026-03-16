Feature: Transaction Data Boundaries

  Background:
    Given a mock aggregator client is set up

  # T3-02: Equivalence Partitioning — empty byte array as mint data
  Scenario: Minting with empty transaction data succeeds
    Given a user with a signing key
    When the user mints a token with empty transaction data
    Then the certification response status is "SUCCESS"

  # T3-02: Equivalence Partitioning — large data payload in mint
  Scenario: Minting with large transaction data succeeds
    Given a user with a signing key
    When the user mints a token with 10KB of random transaction data
    Then the certification response status is "SUCCESS"

  # T3-02: Equivalence Partitioning — large data payload in transfer
  Scenario: Transfer with large transaction data succeeds
    Given Alice has a minted token
    And Bob is a registered user
    When Alice transfers the token to Bob with 10KB of random data
    Then the transferred token passes verification
