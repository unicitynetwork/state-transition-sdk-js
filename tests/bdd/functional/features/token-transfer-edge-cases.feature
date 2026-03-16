Feature: Token Transfer Edge Cases
  As a user of the state transition SDK
  I want edge case transfers to be handled correctly
  So that the system behaves predictably

  Background:
    Given a mock aggregator client is set up
    And Alice has a minted token

  # T2-01: self-transfer (Decision Table)
  Scenario: Owner transfers token to themselves
    When Alice transfers the token to herself
    Then the transferred token passes verification

  # T2-05: stale-token-reuse (Decision Table + State Transition — aggregator rejects duplicate state ID)
  Scenario: Stale token object cannot be reused after transfer
    Given Bob is a registered user
    When Alice transfers the token to Bob
    And Alice tries to submit a transfer of the stale token to Bob
    Then the certification response status is "STATE_ID_EXISTS"
