Feature: Token Long Transfer Chain
  As a user of the state transition SDK
  I want long transfer chains to verify correctly
  So that tokens maintain integrity through many transfers

  Background:
    Given a mock aggregator client is set up
    And the following users are registered:
      | name  |
      | Alice |
      | Bob   |
    And "Alice" has a minted token

  # T2-03: long-transfer-chain (BVA + Loop Testing)
  Scenario: Token survives 10-hop transfer chain
    When the token is transferred 10 times between "Alice" and "Bob"
    Then the token should have 10 transactions in its history
    And the token should pass verification
