Feature: Full Payment Use Case Journey

  Background:
    Given a mock aggregator client is set up

  # T3-03: Use Case Testing — end-to-end mint -> split -> pay -> verify
  Scenario: Complete payment flow from mint through split to transfer
    Given Alice has a minted token with 2 payment assets worth 100 and 200
    And Bob is a registered user
    When Alice splits the token into 2 parts keeping ownership
    And Alice transfers the first split token to Bob
    Then Bob's received token passes verification
    And each split token passes TokenSplit verification
