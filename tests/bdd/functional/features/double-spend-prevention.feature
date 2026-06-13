Feature: Double Spend Prevention
  As a network participant
  I want double-spend attempts to be detected
  So that the integrity of token ownership is maintained

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  Scenario: Double-spend attempt is detected via inclusion proof
    Given Bob is a registered user
    When Alice submits a valid transfer to Bob
    And Alice submits a second transfer of the same token
    Then the first aggregator response is "SUCCESS"
    And the second aggregator response is "SUCCESS"
    But the inclusion proof verification rejects the second transfer with "TRANSACTION_HASH_MISMATCH"
