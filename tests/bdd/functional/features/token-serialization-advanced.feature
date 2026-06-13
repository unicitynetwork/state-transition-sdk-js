Feature: Token Serialization - Advanced Scenarios
  As a token holder
  I want to export and import tokens with transfer history via CBOR
  So that I can persist and share tokens that have been transferred multiple times

  Background:
    Given a mock aggregator client is set up
    And the following users are registered:
      | name  |
      | Alice |
      | Bob   |
      | Carol |
      | Dave  |
    And "Alice" has a minted token

  Scenario: CBOR round-trip preserves single transfer history
    When "Alice" transfers the token to "Bob"
    And the current token is exported to CBOR
    And the CBOR data is imported back to a token
    Then the imported token should have the same ID as the current token
    And the imported token should have 1 transaction in its history
    And the imported token should pass verification

  Scenario: CBOR round-trip preserves multi-hop transfer history
    When "Alice" transfers the token to "Bob"
    And "Bob" transfers the token to "Carol"
    And the current token is exported to CBOR
    And the CBOR data is imported back to a token
    Then the imported token should have the same ID as the current token
    And the imported token should have 2 transactions in its history
    And the imported token should pass verification

  Scenario: CBOR round-trip after 4-hop transfer chain
    When "Alice" transfers the token to "Bob"
    And "Bob" transfers the token to "Carol"
    And "Carol" transfers the token to "Dave"
    And "Dave" transfers the token to "Alice"
    And the current token is exported to CBOR
    And the CBOR data is imported back to a token
    Then the imported token should have the same ID as the current token
    And the imported token should have 4 transactions in its history
    And the imported token should pass verification

  Scenario: Imported token with history can be transferred again
    When "Alice" transfers the token to "Bob"
    And the current token is exported to CBOR
    And the CBOR data is imported back to a token
    And "Bob" transfers the imported token to "Carol"
    Then the token should have 2 transactions in its history
    And the token should pass verification
