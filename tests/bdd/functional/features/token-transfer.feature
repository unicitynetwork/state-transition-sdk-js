Feature: Token Transfer
  As a token owner
  I want to transfer my tokens to other users
  So that I can exchange digital assets

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  Scenario: Owner transfers token to another user
    Given Bob is a registered user
    When Alice transfers the token to Bob
    Then the transfer certification succeeds
    And the token is finalized

  Scenario: Transferred token passes verification
    Given Bob is a registered user
    When Alice transfers the token to Bob
    Then the transferred token passes verification

  Scenario: Token can be transferred through chain of owners
    Given Bob is a registered user
    When Alice transfers the token to Bob
    And Bob transfers the token back to Alice
    Then the final token passes verification
