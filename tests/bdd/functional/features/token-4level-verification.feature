Feature: 4-Level Token Tree - Verification
  As a token system
  I want to verify all tokens in a 4-level split/transfer tree
  So that I can ensure the integrity of multi-level token operations

  Background:
    Given the 4-level token tree is built

  Scenario Outline: Live token <token> passes Token.verify
    Then "<token>" passes verification

    Examples:
      | token     |
      | T2a_carol |
      | T3a_dave  |
      | T3b_alice |
      | T4a_alice |
      | T4b_bob   |

  Scenario Outline: Burned token <token> passes Token.verify
    Then "<token>" passes verification

    Examples:
      | token      |
      | T0_burned  |
      | T1a_burned |
      | T1b_burned |
      | T2b_burned |

  Scenario Outline: Split token <token> passes TokenSplit.verify
    Then "<token>" passes split verification

    Examples:
      | token     |
      | T2a_carol |
      | T3a_dave  |
      | T3b_alice |
      | T4a_alice |
      | T4b_bob   |
      | T1a_pre   |
      | T1b_pre   |
      | T2a_pre   |
      | T2b_pre   |
      | T3a_pre   |
      | T3b_pre   |
      | T4a_pre   |
      | T4b_pre   |

  Scenario Outline: Token <token> survives CBOR serialization round-trip
    When "<token>" is exported to CBOR and imported back
    Then the imported token has the same ID as "<token>"
    And the imported token passes verification

    Examples:
      | token      |
      | T2a_carol  |
      | T3a_dave   |
      | T3b_alice  |
      | T4a_alice  |
      | T4b_bob    |
      | T0_burned  |
      | T1a_burned |
      | T1b_burned |
      | T2b_burned |
