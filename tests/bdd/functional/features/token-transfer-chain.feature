Feature: Token Transfer Chain
  As a token owner
  I want to transfer tokens through multiple users
  So that tokens can change hands in a chain while maintaining integrity

  Background:
    Given a mock aggregator client is set up
    And the following users are registered:
      | name  |
      | Alice |
      | Bob   |
      | Carol |
      | Dave  |
    And "Alice" has a minted token

  Scenario: Token can be transferred through a chain of 4 users
    When "Alice" transfers the token to "Bob"
    And "Bob" transfers the token to "Carol"
    And "Carol" transfers the token to "Dave"
    Then the token should have 3 transactions in its history
    And the token should pass verification

  Scenario: Long transfer chain preserves token ID and type
    When "Alice" transfers the token to "Bob"
    And "Bob" transfers the token to "Carol"
    And "Carol" transfers the token to "Dave"
    Then the token should have the same ID as the original
    And the token should have the same type as the original

  Scenario: Token can be transferred back to original owner
    When "Alice" transfers the token to "Bob"
    And "Bob" transfers the token to "Carol"
    And "Carol" transfers the token to "Dave"
    And "Dave" transfers the token to "Alice"
    Then the token should have 4 transactions in its history
    And the token should pass verification
    And "Alice" should own the token

  Scenario: Each transfer in chain is individually valid
    When "Alice" transfers the token to "Bob"
    And "Bob" transfers the token to "Carol"
    And "Carol" transfers the token to "Dave"
    Then the token should pass verification

  Scenario Outline: Transfer chain with <chainLength> hops
    When "Alice" transfers the token to "Bob"
    And "Bob" transfers the token to "Carol"
    Then the token should have <expectedTransactions> transactions in its history
    And the token should pass verification

    Examples:
      | chainLength | expectedTransactions |
      | 2           | 2                    |
