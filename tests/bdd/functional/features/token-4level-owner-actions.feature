Feature: 4-Level Token Tree - Owner Actions and Double-Spend Prevention
  As a token system
  I want owners to be able to use their tokens
  And I want to prevent double-spending via pre-transfer token references

  Background:
    Given the 4-level token tree is built

  Scenario Outline: Owner <user> can create a valid transfer for <token>
    When <user> creates a transfer for "<token>"
    Then the transfer creation succeeds

    Examples:
      | user  | token     |
      | Carol | T2a_carol |
      | Dave  | T3a_dave  |
      | Alice | T3b_alice |
      | Alice | T4a_alice |
      | Bob   | T4b_bob   |

  Scenario Outline: Owner <user> can transfer <token> to <recipient>
    When <user> transfers "<token>" to <recipient>
    Then the transferred token passes verification

    Examples:
      | user  | token     | recipient |
      | Carol | T2a_carol | Dave      |
      | Dave  | T3a_dave  | Alice     |
      | Alice | T3b_alice | Bob       |
      | Alice | T4a_alice | Carol     |
      | Bob   | T4b_bob   | Dave      |

  # The re-spend is rejected either at submit (STATE_ID_EXISTS, finalized-dup lookup) or at
  # proof time (TRANSACTION_HASH_MISMATCH) depending on the aggregator's submit path
  # (aggregator-go#151 skip-finalized-dup-lookup / async-v2). Either way the double-spend
  # cannot produce a valid token — assert tolerantly. See sdk-js#118.
  Scenario Outline: Double-spend detected when <user> reuses pre-transfer token <token>
    When <user> submits a duplicate transfer for pre-transfer token "<token>"
    Then the duplicate transfer is rejected as a double-spend

    Examples:
      | user  | token   |
      | Alice | T1a_pre |
      | Alice | T1b_pre |
      | Bob   | T2a_pre |
      | Bob   | T2b_pre |
      | Carol | T3a_pre |
      | Carol | T3b_pre |
      | Dave  | T4a_pre |
      | Dave  | T4b_pre |

  Scenario Outline: Non-owner <user> cannot use pre-transfer token <token>
    When <user> tries to transfer "<token>"
    Then the transfer fails with predicate mismatch

    Examples:
      | user  | token   |
      | Bob   | T1a_pre |
      | Carol | T1a_pre |
      | Dave  | T1a_pre |
      | Bob   | T1b_pre |
      | Carol | T1b_pre |
      | Dave  | T1b_pre |
      | Alice | T2a_pre |
      | Carol | T2a_pre |
      | Dave  | T2a_pre |
      | Alice | T2b_pre |
      | Carol | T2b_pre |
      | Dave  | T2b_pre |
      | Alice | T3a_pre |
      | Bob   | T3a_pre |
      | Dave  | T3a_pre |
      | Alice | T3b_pre |
      | Bob   | T3b_pre |
      | Dave  | T3b_pre |
      | Alice | T4a_pre |
      | Bob   | T4a_pre |
      | Carol | T4a_pre |
      | Alice | T4b_pre |
      | Bob   | T4b_pre |
      | Carol | T4b_pre |
