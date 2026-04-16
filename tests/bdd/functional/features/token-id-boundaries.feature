Feature: Token ID Boundary Lengths

  Background:
    Given a mock aggregator client is set up
    And a user with a signing key

  # T3-01: BVA — non-standard lengths are accepted by the aggregator
  Scenario Outline: Minting with <length>-byte token ID is accepted
    When the user submits a mint request with a <length>-byte token ID
    Then the certification response status is "SUCCESS"

    Examples:
      | length |
      | 31     |
      | 32     |
      | 33     |

  # T3-01: BVA — 0-byte TokenId produces a fixed state ID (deterministic hash)
  # Since SHA256([] || MINT_SUFFIX) is always the same, this state ID is globally shared
  # and was already committed in a previous aggregator round → STATE_ID_EXISTS
  Scenario: Minting with 0-byte token ID collides with pre-existing global state
    When the user submits a mint request with a 0-byte token ID
    Then the certification response status is "STATE_ID_EXISTS"
