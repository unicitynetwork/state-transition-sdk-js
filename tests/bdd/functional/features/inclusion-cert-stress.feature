@stress
Feature: InclusionCertificate stress and use-case scenarios
  As a maintainer of the state transition SDK
  I want loop and use-case tests against the verify path
  So that radix-SMT or shard-tree-hash regressions surface quickly under realistic load

  Background:
    Given a mock aggregator client is set up

  # T4-35: Loop Testing — back-to-back mints all verify
  Scenario: 20 sequential mints each verify
    When 20 tokens are minted in a row by the same user
    Then every minted token passes verification

  # T4-36: Use Case — mint → 5x transfer chain ends valid
  Scenario: Mint then 5 transfers leave a valid token
    When Alice mints a token and transfers it through 5 owners
    Then the final token has 5 transactions in its history
    And the final token passes verification

  # T4-37: State Transition — duplicate StateID submission returns STATE_ID_EXISTS
  Scenario: Submitting an already-finalised certification returns STATE_ID_EXISTS
    Given Alice has a minted token
    When the same certification data is re-submitted
    Then the re-submission's status is "STATE_ID_EXISTS"
