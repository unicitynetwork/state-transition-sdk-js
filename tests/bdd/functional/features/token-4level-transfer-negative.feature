Feature: 4-Level Token Tree - Unauthorized Transfer Prevention
  As a token system
  I want to prevent unauthorized transfers
  So that only token owners can transfer their tokens

  Background:
    Given the 4-level token tree is built

  Scenario Outline: <user> cannot transfer live token <token> they do not own
    When <user> tries to transfer "<token>"
    Then the transfer fails with predicate mismatch

    Examples:
      | user  | token     |
      | Alice | T2a_carol |
      | Bob   | T2a_carol |
      | Dave  | T2a_carol |
      | Alice | T3a_dave  |
      | Bob   | T3a_dave  |
      | Carol | T3a_dave  |
      | Bob   | T3b_alice |
      | Carol | T3b_alice |
      | Dave  | T3b_alice |
      | Bob   | T4a_alice |
      | Carol | T4a_alice |
      | Dave  | T4a_alice |
      | Alice | T4b_bob   |
      | Carol | T4b_bob   |
      | Dave  | T4b_bob   |

  Scenario Outline: <user> cannot transfer burned token <token>
    When <user> tries to transfer "<token>"
    Then the transfer fails with predicate mismatch

    Examples:
      | user  | token      |
      | Alice | T0_burned  |
      | Bob   | T0_burned  |
      | Carol | T0_burned  |
      | Dave  | T0_burned  |
      | Alice | T1a_burned |
      | Bob   | T1a_burned |
      | Carol | T1a_burned |
      | Dave  | T1a_burned |
      | Alice | T1b_burned |
      | Bob   | T1b_burned |
      | Carol | T1b_burned |
      | Dave  | T1b_burned |
      | Alice | T2b_burned |
      | Bob   | T2b_burned |
      | Carol | T2b_burned |
      | Dave  | T2b_burned |
