Feature: NetworkId singleton identity and JSON round-trip semantics — sdk-js#115

  # PR #119 / sdk-js#115 added NetworkId with MAINNET/TESTNET/LOCAL constants and a fromId
  # builder. fromId returns the registered singleton for known ids but a fresh anonymous
  # instance for any other 16-bit value — meaning code that uses `===` instead of `.equals(...)`
  # silently mishandles custom-id networks. This feature pins that contract so a refactor
  # cannot regress it.
  #
  # All scenarios are hermetic.

  Scenario Outline: NetworkId.fromId(<id>) returns the registered singleton instance
    When NetworkId.fromId is called with <id>
    And NetworkId.fromId is called with <id> a second time
    Then both calls return the same singleton instance
    And the resolved NetworkId is identity-equal to the registered constant <constant>

    Examples:
      | id | constant |
      | 1  | MAINNET  |
      | 2  | TESTNET  |
      | 3  | LOCAL    |

  Scenario: Two NetworkId.fromId calls with a custom 16-bit id return distinct instances
    When NetworkId.fromId is called with 42
    And NetworkId.fromId is called with 42 a second time
    Then the two instances are NOT identity-equal
    And the two instances are equal by value

  Scenario: A NetworkId reconstructed via RootTrustBase JSON round-trip compares equal
    Given a baseline NetworkId is built from id 3
    When the baseline NetworkId is encoded into a trust-base JSON and decoded back
    Then the round-tripped NetworkId equals the baseline
