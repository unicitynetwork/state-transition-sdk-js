Feature: Certification Status Handling
  As a user of the state transition SDK
  I want to receive correct certification statuses
  So that I can handle error conditions properly

  Background:
    Given a mock aggregator client is set up

  # T1-06: duplicate-token-id-mint — v2 async detection (State Transition)
  # Both submits return SUCCESS; double-mint detected at finalization via inclusion proof
  Scenario: Duplicate mint is detected via inclusion proof mismatch
    Given a user with a signing key
    When the user submits a mint request for a specific token ID
    And the user submits a second mint request for the same token ID
    Then the first aggregator response is "SUCCESS"
    And the second aggregator response is "SUCCESS"
    But the inclusion proof verification rejects the second mint with "TRANSACTION_HASH_MISMATCH"

  # T1-01 + T1-05: wrong-key-transfer-rejected (Branch Coverage + Error Guessing + Risk-Based)
  Scenario: Transfer signed with wrong key is rejected by aggregator
    Given Alice has a minted token
    And Bob is a registered user
    When Alice creates a transfer to Bob signed with the wrong key
    Then the certification response status is "SIGNATURE_VERIFICATION_FAILED"
